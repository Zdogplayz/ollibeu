import { safeStorage, shell } from 'electron'
import { randomBytes } from 'crypto'
import { promises as fs } from 'fs'
import { createServer, type Server } from 'http'
import path from 'path'
import type { GoogleStatus } from '../../shared/types'
import { loadGoogleConfig, type GoogleClientConfig } from './config'
import { buildAuthUrl, generatePkce } from './pkce'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/tasks'
]

interface StoredTokens {
  refreshToken: string
  accessToken: string
  expiresAt: number // epoch ms
  email?: string
}

const LANDING_HTML = `<!doctype html><meta charset="utf-8"><title>Ollibeu</title>
<body style="font-family:system-ui;background:#f2f5ef;color:#33443a;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center"><h2>All connected 🌿</h2><p>You can close this tab and head back to Ollibeu.</p></div>`

const TROUBLE_HTML = `<!doctype html><meta charset="utf-8"><title>Ollibeu</title>
<body style="font-family:system-ui;background:#f2f5ef;color:#33443a;display:flex;align-items:center;justify-content:center;height:100vh">
<div style="text-align:center"><h2>That didn’t quite go through 🍃</h2><p>You can close this tab and try again from Ollibeu whenever you like.</p></div>`

export class GoogleAuth {
  private config: GoogleClientConfig | null
  private tokens: StoredTokens | null
  private readonly tokenPath: string
  private connecting = false
  private listeners = new Set<(s: GoogleStatus) => void>()
  private cancelPending: (() => void) | null = null
  private cancelRequested = false
  private needsReconnect = false
  private pendingAuthUrl: string | null = null
  private persistQueue: Promise<void> = Promise.resolve()

  private constructor(tokenPath: string, config: GoogleClientConfig | null, tokens: StoredTokens | null) {
    this.tokenPath = tokenPath
    this.config = config
    this.tokens = tokens
  }

  static async create(userDataDir: string): Promise<GoogleAuth> {
    const config = await loadGoogleConfig(process.env, path.join(userDataDir, 'google-oauth.json'))
    const tokenPath = path.join(userDataDir, 'google-tokens.bin')
    let tokens: StoredTokens | null = null
    try {
      const raw = await fs.readFile(tokenPath)
      const json = safeStorage.isEncryptionAvailable()
        ? safeStorage.decryptString(raw)
        : raw.toString('utf8')
      tokens = JSON.parse(json)
    } catch {
      tokens = null
    }
    if (process.platform === 'linux') {
      console.warn('[ollibeu] safeStorage backend:', safeStorage.getSelectedStorageBackend())
    }
    return new GoogleAuth(tokenPath, config, tokens)
  }

  onStatusChange(cb: (s: GoogleStatus) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const s = this.status()
    for (const cb of this.listeners) {
      try {
        cb(s)
      } catch (err) {
        console.error('[ollibeu] listener error', err)
      }
    }
  }

  status(): GoogleStatus {
    if (!this.config) return { state: 'unconfigured' }
    if (this.connecting) {
      return { state: 'connecting', connectUrl: this.pendingAuthUrl ?? undefined }
    }
    if (this.tokens) return { state: 'connected', email: this.tokens.email }
    return { state: this.needsReconnect ? 'needs_reconnect' : 'disconnected' }
  }

  private persistTokens(): Promise<void> {
    this.persistQueue = this.persistQueue.catch(() => undefined).then(() => this.doPersistTokens())
    return this.persistQueue
  }

  private async doPersistTokens(): Promise<void> {
    if (!this.tokens) {
      await fs.rm(this.tokenPath, { force: true })
      return
    }
    const json = JSON.stringify(this.tokens)
    if (safeStorage.isEncryptionAvailable()) {
      await fs.writeFile(this.tokenPath, safeStorage.encryptString(json))
    } else {
      console.warn('[ollibeu] OS keychain unavailable; storing Google tokens as plain JSON')
      await fs.rm(this.tokenPath, { force: true })
      await fs.writeFile(this.tokenPath, json, { mode: 0o600 })
    }
  }

  async connect(): Promise<GoogleStatus> {
    if (!this.config || this.connecting) return this.status()
    this.connecting = true
    this.emit()
    try {
      this.cancelRequested = false
      const { verifier, challenge } = generatePkce()
      const state = randomBytes(24).toString('base64url')
      const { code, redirectUri } = await this.awaitLoopbackCode(challenge, state)
      const body = new URLSearchParams({
        client_id: this.config.clientId,
        ...(this.config.clientSecret ? { client_secret: this.config.clientSecret } : {}),
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri
      })
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      })
      if (!res.ok) {
        console.error('[ollibeu] token exchange failed', res.status, (await res.text()).slice(0, 200))
        throw new Error(`token exchange failed: ${res.status}`)
      }
      const t = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in: number
        id_token?: string
      }
      if (!t.refresh_token) throw new Error('no refresh_token in response')
      if (this.cancelRequested) {
        if (t.refresh_token) {
          void fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token)}`,
            { method: 'POST' }
          ).catch(() => undefined)
        }
        throw new Error('cancelled')
      }
      this.tokens = {
        refreshToken: t.refresh_token,
        accessToken: t.access_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        email: t.id_token ? decodeEmailFromIdToken(t.id_token) : undefined
      }
      await this.persistTokens()
      this.needsReconnect = false
      return this.status()
    } catch (err) {
      if ((err as Error).message === 'cancelled') return this.status()
      throw err
    } finally {
      this.connecting = false
      this.emit()
    }
  }

  private awaitLoopbackCode(
    challenge: string,
    state: string
  ): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      const settle = (fn: () => void): void => {
        this.cancelPending = null
        this.pendingAuthUrl = null
        fn()
      }
      const server: Server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }
        const err = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const gotState = url.searchParams.get('state')
        if (!err && gotState !== state) {
          // stray/garbage request: not our flow — ignore and keep waiting
          res.writeHead(404).end()
          return
        }
        const ok = !err && !!code && gotState === state
        res
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(ok ? LANDING_HTML : TROUBLE_HTML)
        server.close()
        clearTimeout(timer)
        if (err || !code) settle(() => reject(new Error(err ?? 'no code')))
        else settle(() => resolve({ code, redirectUri }))
      })
      let redirectUri = ''
      const timer = setTimeout(
        () => {
          server.close()
          settle(() => reject(new Error('sign-in timed out')))
        },
        5 * 60 * 1000
      )
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          settle(() => reject(new Error('could not bind loopback')))
          return
        }
        redirectUri = `http://127.0.0.1:${address.port}/callback`
        this.cancelPending = () => {
          clearTimeout(timer)
          server.close()
          settle(() => reject(new Error('cancelled')))
        }
        if (!this.config) {
          settle(() => reject(new Error('unconfigured')))
          return
        }
        if (this.cancelRequested) {
          clearTimeout(timer)
          server.close()
          settle(() => reject(new Error('cancelled')))
          return
        }
        const authUrl = buildAuthUrl({
          clientId: this.config.clientId,
          redirectUri,
          challenge,
          scopes: SCOPES,
          state
        })
        // Expose the URL while connecting so the UI can offer a copy-link
        // fallback on systems where no browser opener exists.
        this.pendingAuthUrl = authUrl
        this.emit()
        shell
          .openExternal(authUrl)
          .catch((err) => {
            // No system browser opener (e.g. bare WSL without xdg-open).
            // Keep the loopback alive: the UI offers the copy-link fallback,
            // and the 5-minute timeout still bounds the wait.
            console.error('[ollibeu] could not open the browser for sign-in', err)
          })
      })
    })
  }

  expireAccessToken(): void {
    if (this.tokens) this.tokens = { ...this.tokens, expiresAt: 0 }
  }

  async getAccessToken(): Promise<string> {
    if (!this.tokens || !this.config) throw new Error('needs_reconnect')
    if (Date.now() < this.tokens.expiresAt - 60_000) return this.tokens.accessToken
    const body = new URLSearchParams({
      client_id: this.config.clientId,
      ...(this.config.clientSecret ? { client_secret: this.config.clientSecret } : {}),
      refresh_token: this.tokens.refreshToken,
      grant_type: 'refresh_token'
    })
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body
    })
    if (!res.ok) {
      const text = await res.text()
      if (res.status === 400 && text.includes('invalid_grant')) {
        this.tokens = null
        this.needsReconnect = true
        await this.persistTokens()
        this.emit()
        throw new Error('needs_reconnect')
      }
      throw new Error(`token refresh: ${res.status}`)
    }
    const t = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string }
    this.tokens = {
      ...this.tokens,
      refreshToken: t.refresh_token ?? this.tokens.refreshToken,
      accessToken: t.access_token,
      expiresAt: Date.now() + t.expires_in * 1000
    }
    await this.persistTokens()
    return this.tokens.accessToken
  }

  async disconnect(): Promise<GoogleStatus> {
    this.cancelRequested = true
    this.needsReconnect = false
    this.cancelPending?.()
    this.cancelPending = null
    if (this.tokens) {
      void fetch(
        `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(this.tokens.refreshToken)}`,
        { method: 'POST' }
      ).catch(() => undefined)
    }
    this.tokens = null
    await this.persistTokens()
    this.emit()
    return this.status()
  }
}

function decodeEmailFromIdToken(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'))
    return typeof payload.email === 'string' ? payload.email : undefined
  } catch {
    return undefined
  }
}
