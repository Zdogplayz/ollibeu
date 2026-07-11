import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadGoogleConfig } from '../src/main/google/config'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ollibeu-gcfg-'))
})

describe('loadGoogleConfig', () => {
  it('prefers environment variables', async () => {
    const cfg = await loadGoogleConfig(
      { GOOGLE_CLIENT_ID: 'env-id', GOOGLE_CLIENT_SECRET: 'env-secret' },
      path.join(dir, 'google-oauth.json')
    )
    expect(cfg).toEqual({ clientId: 'env-id', clientSecret: 'env-secret' })
  })

  it('falls back to the json file', async () => {
    const p = path.join(dir, 'google-oauth.json')
    await writeFile(p, JSON.stringify({ clientId: 'file-id', clientSecret: 's' }), 'utf8')
    expect(await loadGoogleConfig({}, p)).toEqual({ clientId: 'file-id', clientSecret: 's' })
  })

  it('returns null when nothing is configured or file is malformed', async () => {
    expect(await loadGoogleConfig({}, path.join(dir, 'missing.json'))).toBeNull()
    const bad = path.join(dir, 'google-oauth.json')
    await writeFile(bad, '{nope', 'utf8')
    expect(await loadGoogleConfig({}, bad)).toBeNull()
    await writeFile(bad, JSON.stringify({ clientSecret: 'no-id' }), 'utf8')
    expect(await loadGoogleConfig({}, bad)).toBeNull()
  })

  describe('build-embedded defaults', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('falls back to keys baked into the build when env and file are absent', async () => {
      vi.stubGlobal('__OLLIBEU_GID__', 'baked-id')
      vi.stubGlobal('__OLLIBEU_GSECRET__', 'baked-secret')
      expect(await loadGoogleConfig({}, path.join(dir, 'missing.json'))).toEqual({
        clientId: 'baked-id',
        clientSecret: 'baked-secret'
      })
    })

    it('a user-provided file still beats the baked-in keys', async () => {
      vi.stubGlobal('__OLLIBEU_GID__', 'baked-id')
      const p = path.join(dir, 'google-oauth.json')
      await writeFile(p, JSON.stringify({ clientId: 'file-id' }), 'utf8')
      expect(await loadGoogleConfig({}, p)).toEqual({ clientId: 'file-id', clientSecret: undefined })
    })

    it('an empty baked-in id is treated as no embedded keys', async () => {
      vi.stubGlobal('__OLLIBEU_GID__', '')
      expect(await loadGoogleConfig({}, path.join(dir, 'missing.json'))).toBeNull()
    })
  })
})
