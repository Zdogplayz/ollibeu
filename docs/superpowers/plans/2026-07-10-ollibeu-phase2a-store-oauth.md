# Ollibeu Phase 2a: Main-Owned Store + Google Sign-In

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Refactor data ownership into the main process (prerequisite for background sync — main becomes a writer in 2b) and implement Google OAuth: the Today rail gets a real "Connect Google" button, the PKCE loopback flow runs in the system browser, and tokens persist encrypted. Phase 2b (calendar/tasks sync + live rail) builds on this.

**Architecture:** Main process owns `OllibeuData` via a `DataStore` (in-memory + serialized atomic saves + `data:changed` broadcast). The renderer becomes a thin subscriber sending typed mutations — no more whole-blob saves from the renderer. Google auth lives entirely in main: PKCE + loopback redirect + system browser; tokens encrypted with `safeStorage` in userData. No new npm dependencies (Node 20 global `fetch`; hand-rolled REST).

**Tech Stack:** unchanged. OAuth endpoints: `https://accounts.google.com/o/oauth2/v2/auth`, token `https://oauth2.googleapis.com/token`. Scopes: `openid email https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/tasks`.

## Global Constraints

- No-guilt copy rule everywhere ("overdue"/"late"/"failed"/"behind" banned in UI strings).
- The four Phase 1 protections must survive the refactor: load failure → gentle explanation card (never blank); save failure → quiet non-blocking hint; saves serialized (now inside DataStore); no silent data deletion.
- OAuth client config is NOT hardcoded: read `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` from env, falling back to `<userData>/google-oauth.json` (`{ "clientId": "...", "clientSecret": "..." }`). Missing config → the Connect button shows gentle "needs setup" copy, never a crash.
- Tokens: `safeStorage.encryptString` → `<userData>/google-tokens.bin`; if `safeStorage.isEncryptionAvailable()` is false, store plaintext JSON with mode 0600 and log a one-line warning (dev-environment fallback).
- Renderer never sees tokens — only `GoogleStatus`.
- All gates before each commit: `npm run typecheck && npm test && npm run build` (44 tests baseline; new tests add to this).
- Branch: `feat/phase2a-store-oauth` from `main`. Commit messages exactly as given.

## File Structure

```
src/shared/types.ts               — + GoogleStatus, GoogleAccount; OllibeuData unchanged
src/main/dataStore.ts             — NEW: DataStore class (load/mutate/save-serialized/subscribe)
src/main/index.ts                 — rewire IPC to DataStore + typed mutations + google IPC
src/main/google/config.ts         — NEW: client-config loader (env → json file → null)
src/main/google/pkce.ts           — NEW: pure PKCE + auth-URL helpers
src/main/google/auth.ts           — NEW: loopback flow, token exchange/refresh, persistence
src/preload/index.ts              — typed mutation API + onDataChanged + google API
src/renderer/src/global.d.ts      — updated window.ollibeu typing
src/renderer/src/App.tsx          — subscribe instead of own; mutations via IPC
src/renderer/src/components/TodayRail.tsx — Connect Google states
tests/dataStore.test.ts           — NEW
tests/pkce.test.ts                — NEW
tests/googleConfig.test.ts        — NEW
```

---

### Task 1: DataStore — main-owned state (TDD)

**Files:**
- Create: `src/main/dataStore.ts`, `tests/dataStore.test.ts`

**Interfaces:**
- Consumes: `loadData`/`saveData`/`emptyData` from `src/main/storage.ts` (unchanged).
- Produces: `class DataStore { static async open(filePath): Promise<DataStore>; get(): OllibeuData; mutate(fn: (d: OllibeuData) => OllibeuData): Promise<void>; onChange(cb: (d: OllibeuData) => void): () => void; onSaveTrouble(cb: (trouble: boolean) => void): () => void }`. `mutate` applies synchronously to memory, notifies `onChange` immediately, then persists through an internal serialized queue; a failed save fires `onSaveTrouble(true)`, the next successful save fires `onSaveTrouble(false)`.

- [ ] **Step 1: Write the failing test `tests/dataStore.test.ts`**

```ts
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataStore } from '../src/main/dataStore'
import type { Task } from '../src/shared/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ollibeu-store-'))
})

function aTask(id: string): Task {
  return { id, title: id, importance: 'low', source: 'local', createdAt: '2026-07-10T09:00:00' }
}

describe('DataStore', () => {
  it('opens with defaults when no file exists and get() returns current state', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    expect(store.get().tasks).toEqual([])
    expect(store.get().settings.theme).toBe('auto')
  })

  it('mutate applies synchronously, notifies listeners, and persists', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    const seen: number[] = []
    store.onChange((d) => seen.push(d.tasks.length))
    await store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('a')] }))
    expect(store.get().tasks).toHaveLength(1)
    expect(seen).toEqual([1])
    expect(JSON.parse(await readFile(file, 'utf8')).tasks).toHaveLength(1)
  })

  it('serializes overlapping mutations in order', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    await Promise.all([
      store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('a')] })),
      store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('b')] }))
    ])
    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    expect(onDisk.tasks.map((t: Task) => t.id)).toEqual(['a', 'b'])
  })

  it('unsubscribe stops notifications', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    const cb = vi.fn()
    const off = store.onChange(cb)
    off()
    await store.mutate((d) => d)
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires saveTrouble true on failed save and false once saving recovers', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    const states: boolean[] = []
    store.onSaveTrouble((t) => states.push(t))
    // Make the save path fail: replace the data file's parent with an unwritable target
    // by pointing a second mutation at a directory-as-file path via the internal queue.
    // Simpler deterministic route: monkeypatch the store's save function.
    const anyStore = store as unknown as { save: (d: unknown) => Promise<void> }
    const realSave = anyStore.save.bind(store)
    anyStore.save = () => Promise.reject(new Error('disk full'))
    await store.mutate((d) => d) // fails to persist
    anyStore.save = realSave
    await store.mutate((d) => d) // recovers
    expect(states).toEqual([true, false])
  })

  it('open propagates unexpected read errors (no silent wipe)', async () => {
    await expect(DataStore.open(dir)).rejects.toThrow()
  })

  it('open survives corrupt JSON with defaults', async () => {
    const file = path.join(dir, 'data.json')
    await writeFile(file, '{nope', 'utf8')
    const store = await DataStore.open(file)
    expect(store.get().tasks).toEqual([])
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/dataStore.test.ts`
Expected: FAIL — module `../src/main/dataStore` not found.

- [ ] **Step 3: Write `src/main/dataStore.ts`**

```ts
import type { OllibeuData } from '../shared/types'
import { loadData, saveData } from './storage'

type ChangeListener = (data: OllibeuData) => void
type TroubleListener = (trouble: boolean) => void

export class DataStore {
  private data: OllibeuData
  private readonly filePath: string
  private queue: Promise<void> = Promise.resolve()
  private changeListeners = new Set<ChangeListener>()
  private troubleListeners = new Set<TroubleListener>()
  private inTrouble = false

  private constructor(filePath: string, initial: OllibeuData) {
    this.filePath = filePath
    this.data = initial
  }

  static async open(filePath: string): Promise<DataStore> {
    const initial = await loadData(filePath)
    return new DataStore(filePath, initial)
  }

  get(): OllibeuData {
    return this.data
  }

  onChange(cb: ChangeListener): () => void {
    this.changeListeners.add(cb)
    return () => this.changeListeners.delete(cb)
  }

  onSaveTrouble(cb: TroubleListener): () => void {
    this.troubleListeners.add(cb)
    return () => this.troubleListeners.delete(cb)
  }

  private save(data: OllibeuData): Promise<void> {
    return saveData(this.filePath, data)
  }

  private setTrouble(trouble: boolean): void {
    if (this.inTrouble === trouble) return
    this.inTrouble = trouble
    for (const cb of this.troubleListeners) cb(trouble)
  }

  async mutate(fn: (d: OllibeuData) => OllibeuData): Promise<void> {
    this.data = fn(this.data)
    const snapshot = this.data
    for (const cb of this.changeListeners) cb(snapshot)
    this.queue = this.queue.then(async () => {
      try {
        await this.save(snapshot)
        this.setTrouble(false)
      } catch {
        this.setTrouble(true)
      }
    })
    await this.queue
  }
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/dataStore.test.ts`
Expected: PASS — 7 tests.

- [ ] **Step 5: Full gates + commit**

Run: `npm run typecheck && npm test && npm run build` — expect 51 tests.

```bash
git add src/main/dataStore.ts tests/dataStore.test.ts
git commit -m "feat: main-owned DataStore with serialized saves and change broadcast"
```

---

### Task 2: Rewire IPC + renderer to main-owned state

**Files:**
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`, `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `DataStore` (Task 1).
- Produces (preload API — 2b and Task 4 build on this):
  - `getData(): Promise<OllibeuData>`
  - `mutate: { addTask(task: Task): Promise<void>; completeTask(id: string, completedAt: string): Promise<void>; setSettings(patch: Partial<Settings>): Promise<void>; setAppState(patch: Partial<AppState>): Promise<void> }`
  - `onDataChanged(cb: (d: OllibeuData) => void): () => void`
  - `onSaveTrouble(cb: (t: boolean) => void): () => void`
- IPC channels: `data:get`, `task:add`, `task:complete`, `settings:set`, `appstate:set`; pushes `data:changed`, `data:save-trouble`.

- [ ] **Step 1: Replace `src/main/index.ts` with:**

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import type { AppState, Settings, Task } from '../shared/types'
import { DataStore } from './dataStore'

const dataPath = (): string => path.join(app.getPath('userData'), 'ollibeu-data.json')

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#f2f5ef',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') }
  })
  win.once('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
  return win
}

function broadcast(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}

app.whenReady().then(async () => {
  let store: DataStore
  try {
    store = await DataStore.open(dataPath())
  } catch (err) {
    // Load genuinely failed (not missing/corrupt — storage handles those).
    // Register a handler that rejects so the renderer shows its gentle card.
    ipcMain.handle('data:get', () => {
      throw err
    })
    createWindow()
    return
  }

  store.onChange((d) => broadcast('data:changed', d))
  store.onSaveTrouble((t) => broadcast('data:save-trouble', t))

  ipcMain.handle('data:get', () => store.get())
  ipcMain.handle('task:add', (_e, task: Task) =>
    store.mutate((d) => ({ ...d, tasks: [...d.tasks, task] }))
  )
  ipcMain.handle('task:complete', (_e, id: string, completedAt: string) =>
    store.mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, completedAt } : t)),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
  )
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) =>
    store.mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  )
  ipcMain.handle('appstate:set', (_e, patch: Partial<AppState>) =>
    store.mutate((d) => ({ ...d, appState: { ...d.appState, ...patch } }))
  )

  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

Note: `appstate:set` with `{ activeTaskId: undefined }` must CLEAR the pin — spread of `{ activeTaskId: undefined }` sets the key to undefined which JSON-serializes away; acceptable. (Task 8's shuffle uses this.)

- [ ] **Step 2: Replace `src/preload/index.ts` with:**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { AppState, OllibeuData, Settings, Task } from '../shared/types'

function subscribe<T>(channel: string) {
  return (cb: (payload: T) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, payload: T): void => cb(payload)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

contextBridge.exposeInMainWorld('ollibeu', {
  getData: (): Promise<OllibeuData> => ipcRenderer.invoke('data:get'),
  mutate: {
    addTask: (task: Task): Promise<void> => ipcRenderer.invoke('task:add', task),
    completeTask: (id: string, completedAt: string): Promise<void> =>
      ipcRenderer.invoke('task:complete', id, completedAt),
    setSettings: (patch: Partial<Settings>): Promise<void> =>
      ipcRenderer.invoke('settings:set', patch),
    setAppState: (patch: Partial<AppState>): Promise<void> =>
      ipcRenderer.invoke('appstate:set', patch)
  },
  onDataChanged: subscribe<OllibeuData>('data:changed'),
  onSaveTrouble: subscribe<boolean>('data:save-trouble')
})
```

- [ ] **Step 3: Replace `src/renderer/src/global.d.ts` with:**

```ts
import type { AppState, OllibeuData, Settings, Task } from '@shared/types'

declare global {
  interface Window {
    ollibeu: {
      getData(): Promise<OllibeuData>
      mutate: {
        addTask(task: Task): Promise<void>
        completeTask(id: string, completedAt: string): Promise<void>
        setSettings(patch: Partial<Settings>): Promise<void>
        setAppState(patch: Partial<AppState>): Promise<void>
      }
      onDataChanged(cb: (d: OllibeuData) => void): () => void
      onSaveTrouble(cb: (t: boolean) => void): () => void
    }
  }
}

export {}
```

- [ ] **Step 4: Rework `src/renderer/src/App.tsx` data flow.** Precise changes (leave everything else — theme tick, justDoneId/doneTimer, shuffledAway, sort toggle, JSX — as is):

Replace the load effect, hydration/persistence effect, and `update()` with:

```tsx
  useEffect(() => {
    let cancelled = false
    window.ollibeu
      .getData()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setLoadTrouble(true)
      })
    const offData = window.ollibeu.onDataChanged((d) => setData(d))
    const offTrouble = window.ollibeu.onSaveTrouble(setSaveTrouble)
    return () => {
      cancelled = true
      offData()
      offTrouble()
    }
  }, [])
```

(Delete the `hydrated` ref and its effect entirely — persistence is main's job now.)

Rewrite the handlers to send mutations (fire-and-forget; state arrives via the push):

```tsx
  function addTask(title: string, importance: Importance, dueDate?: string, dueTime?: string): void {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      importance,
      source: 'local',
      createdAt: new Date().toISOString(),
      ...(dueDate ? { dueDate } : {}),
      ...(dueTime ? { dueTime } : {})
    }
    void window.ollibeu.mutate.addTask(task)
  }

  function completeTask(id: string): void {
    window.clearTimeout(doneTimer.current)
    setJustDoneId(id)
    void window.ollibeu.mutate.completeTask(id, new Date().toISOString())
    doneTimer.current = window.setTimeout(() => setJustDoneId(null), 850)
  }

  function startOneThing(id: string): void {
    void window.ollibeu.mutate.setAppState({ activeTaskId: id })
  }

  function shuffleOneThing(id: string): void {
    const nextExcluded = [...shuffledAway, id]
    const nextPick = data ? pickOneThing(data.tasks, now, nextExcluded) : null
    setShuffledAway(nextPick ? nextExcluded : [])
    if (pinnedTask?.id === id) void window.ollibeu.mutate.setAppState({ activeTaskId: undefined })
  }

  function setTaskSort(mode: TaskSortMode): void {
    void window.ollibeu.mutate.setSettings({ taskSort: mode })
  }
```

Delete the now-unused `update()` function and the `OllibeuData` import if it becomes unused (it stays used by `useState<OllibeuData | null>`).

- [ ] **Step 5: Gates + manual smoke**

Run: `npm run typecheck && npm test && npm run build` — 51 tests, clean.
Dev smoke if display available: add/complete/pin/shuffle/sort all still work; restart persists.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: renderer subscribes to main-owned store via typed mutations"
```

---

### Task 3: PKCE + client config (TDD, pure logic)

**Files:**
- Create: `src/main/google/pkce.ts`, `src/main/google/config.ts`, `tests/pkce.test.ts`, `tests/googleConfig.test.ts`

**Interfaces:**
- Produces:
  - `generatePkce(): { verifier: string; challenge: string }` (RFC 7636, S256)
  - `buildAuthUrl(opts: { clientId: string; redirectUri: string; challenge: string; scopes: string[]; state: string }): string`
  - `loadGoogleConfig(env: NodeJS.ProcessEnv, jsonPath: string): Promise<GoogleClientConfig | null>` where `GoogleClientConfig = { clientId: string; clientSecret?: string }`

- [ ] **Step 1: Write failing tests**

`tests/pkce.test.ts`:

```ts
import { createHash } from 'crypto'
import { describe, expect, it } from 'vitest'
import { buildAuthUrl, generatePkce } from '../src/main/google/pkce'

describe('generatePkce', () => {
  it('produces url-safe verifier of RFC length and matching S256 challenge', () => {
    const { verifier, challenge } = generatePkce()
    expect(verifier).toMatch(/^[A-Za-z0-9\-._~]{43,128}$/)
    const expected = createHash('sha256').update(verifier).digest('base64url')
    expect(challenge).toBe(expected)
  })

  it('is random across calls', () => {
    expect(generatePkce().verifier).not.toBe(generatePkce().verifier)
  })
})

describe('buildAuthUrl', () => {
  it('encodes all required params', () => {
    const url = new URL(
      buildAuthUrl({
        clientId: 'cid',
        redirectUri: 'http://127.0.0.1:43110/callback',
        challenge: 'chal',
        scopes: ['openid', 'email'],
        state: 'xyz'
      })
    )
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth')
    expect(url.searchParams.get('client_id')).toBe('cid')
    expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:43110/callback')
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('code_challenge')).toBe('chal')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('scope')).toBe('openid email')
    expect(url.searchParams.get('state')).toBe('xyz')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
  })
})
```

`tests/googleConfig.test.ts`:

```ts
import { mkdtemp, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
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
})
```

- [ ] **Step 2: Run to verify failures** — both modules missing.

- [ ] **Step 3: Implement**

`src/main/google/pkce.ts`:

```ts
import { createHash, randomBytes } from 'crypto'

export function generatePkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(48).toString('base64url') // 64 url-safe chars
  const challenge = createHash('sha256').update(verifier).digest('base64url')
  return { verifier, challenge }
}

export function buildAuthUrl(opts: {
  clientId: string
  redirectUri: string
  challenge: string
  scopes: string[]
  state: string
}): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', opts.clientId)
  url.searchParams.set('redirect_uri', opts.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('code_challenge', opts.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('scope', opts.scopes.join(' '))
  url.searchParams.set('state', opts.state)
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('prompt', 'consent')
  return url.toString()
}
```

`src/main/google/config.ts`:

```ts
import { promises as fs } from 'fs'

export interface GoogleClientConfig {
  clientId: string
  clientSecret?: string
}

export async function loadGoogleConfig(
  env: NodeJS.ProcessEnv,
  jsonPath: string
): Promise<GoogleClientConfig | null> {
  if (env.GOOGLE_CLIENT_ID) {
    return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET }
  }
  try {
    const parsed = JSON.parse(await fs.readFile(jsonPath, 'utf8'))
    if (typeof parsed.clientId === 'string' && parsed.clientId) {
      return { clientId: parsed.clientId, clientSecret: parsed.clientSecret }
    }
    return null
  } catch {
    return null
  }
}
```

- [ ] **Step 4: Verify pass, full gates** — expect 51 + 6 = 57 tests.

- [ ] **Step 5: Commit**

```bash
git add src/main/google tests/pkce.test.ts tests/googleConfig.test.ts
git commit -m "feat: PKCE helpers and Google client config loader"
```

---

### Task 4: OAuth flow — loopback, token exchange, encrypted persistence

**Files:**
- Create: `src/main/google/auth.ts`
- Modify: `src/shared/types.ts` (GoogleStatus), `src/main/index.ts` (google IPC), `src/preload/index.ts`, `src/renderer/src/global.d.ts`

**Interfaces:**
- `src/shared/types.ts` additions:

```ts
export interface GoogleStatus {
  state: 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'needs_reconnect'
  email?: string
}
```

- `src/main/google/auth.ts` produces `class GoogleAuth`:
  - `static async create(userDataDir: string): Promise<GoogleAuth>` — loads config (via `loadGoogleConfig(process.env, path.join(userDataDir, 'google-oauth.json'))`) and any persisted tokens.
  - `status(): GoogleStatus`
  - `connect(): Promise<GoogleStatus>` — full flow below.
  - `disconnect(): Promise<GoogleStatus>` — revoke (best-effort POST `https://oauth2.googleapis.com/revoke?token=…`), delete token file.
  - `getAccessToken(): Promise<string>` — returns cached access token, refreshing via the refresh token when within 60s of expiry; throws `new Error('needs_reconnect')` when refresh fails with `invalid_grant`. (2b's API client consumes this.)
  - `onStatusChange(cb: (s: GoogleStatus) => void): () => void`
- IPC: `google:status`, `google:connect`, `google:disconnect`; push `google:status-changed`.
- Preload adds: `google: { status(): Promise<GoogleStatus>; connect(): Promise<GoogleStatus>; disconnect(): Promise<GoogleStatus> }` and `onGoogleStatusChanged(cb)`.

- [ ] **Step 1: Write `src/main/google/auth.ts`**

```ts
import { safeStorage, shell } from 'electron'
import { promises as fs } from 'fs'
import { createServer, type Server } from 'http'
import path from 'path'
import type { GoogleStatus } from '../../shared/types'
import { loadGoogleConfig, type GoogleClientConfig } from './config'
import { buildAuthUrl, generatePkce } from './pkce'

const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.readonly',
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

export class GoogleAuth {
  private config: GoogleClientConfig | null
  private tokens: StoredTokens | null
  private readonly tokenPath: string
  private connecting = false
  private listeners = new Set<(s: GoogleStatus) => void>()

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
    return new GoogleAuth(tokenPath, config, tokens)
  }

  onStatusChange(cb: (s: GoogleStatus) => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  private emit(): void {
    const s = this.status()
    for (const cb of this.listeners) cb(s)
  }

  status(): GoogleStatus {
    if (!this.config) return { state: 'unconfigured' }
    if (this.connecting) return { state: 'connecting' }
    if (this.tokens) return { state: 'connected', email: this.tokens.email }
    return { state: 'disconnected' }
  }

  private async persistTokens(): Promise<void> {
    if (!this.tokens) {
      await fs.rm(this.tokenPath, { force: true })
      return
    }
    const json = JSON.stringify(this.tokens)
    if (safeStorage.isEncryptionAvailable()) {
      await fs.writeFile(this.tokenPath, safeStorage.encryptString(json))
    } else {
      console.warn('[ollibeu] OS keychain unavailable; storing Google tokens as plain JSON')
      await fs.writeFile(this.tokenPath, json, { mode: 0o600 })
    }
  }

  async connect(): Promise<GoogleStatus> {
    if (!this.config || this.connecting) return this.status()
    this.connecting = true
    this.emit()
    try {
      const { verifier, challenge } = generatePkce()
      const state = generatePkce().verifier.slice(0, 32)
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
      if (!res.ok) throw new Error(`token exchange: ${res.status} ${await res.text()}`)
      const t = (await res.json()) as {
        access_token: string
        refresh_token?: string
        expires_in: number
        id_token?: string
      }
      if (!t.refresh_token) throw new Error('no refresh_token in response')
      this.tokens = {
        refreshToken: t.refresh_token,
        accessToken: t.access_token,
        expiresAt: Date.now() + t.expires_in * 1000,
        email: t.id_token ? decodeEmailFromIdToken(t.id_token) : undefined
      }
      await this.persistTokens()
      return this.status()
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
      const server: Server = createServer((req, res) => {
        const url = new URL(req.url ?? '/', 'http://127.0.0.1')
        if (url.pathname !== '/callback') {
          res.writeHead(404).end()
          return
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(LANDING_HTML)
        const err = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const gotState = url.searchParams.get('state')
        server.close()
        clearTimeout(timer)
        if (err || !code) reject(new Error(err ?? 'no code'))
        else if (gotState !== state) reject(new Error('state mismatch'))
        else resolve({ code, redirectUri })
      })
      let redirectUri = ''
      const timer = setTimeout(
        () => {
          server.close()
          reject(new Error('sign-in timed out'))
        },
        5 * 60 * 1000
      )
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          reject(new Error('could not bind loopback'))
          return
        }
        redirectUri = `http://127.0.0.1:${address.port}/callback`
        if (!this.config) {
          reject(new Error('unconfigured'))
          return
        }
        void shell.openExternal(
          buildAuthUrl({
            clientId: this.config.clientId,
            redirectUri,
            challenge,
            scopes: SCOPES,
            state
          })
        )
      })
    })
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
        await this.persistTokens()
        this.emit()
        throw new Error('needs_reconnect')
      }
      throw new Error(`token refresh: ${res.status}`)
    }
    const t = (await res.json()) as { access_token: string; expires_in: number }
    this.tokens = {
      ...this.tokens,
      accessToken: t.access_token,
      expiresAt: Date.now() + t.expires_in * 1000
    }
    await this.persistTokens()
    return this.tokens.accessToken
  }

  async disconnect(): Promise<GoogleStatus> {
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
```

- [ ] **Step 2: Add `GoogleStatus` to `src/shared/types.ts`** (exact interface from Interfaces above).

- [ ] **Step 3: Wire IPC in `src/main/index.ts`** — inside `app.whenReady().then(async () => { ... })`, after the store handlers:

```ts
  const google = await GoogleAuth.create(app.getPath('userData'))
  google.onStatusChange((s) => broadcast('google:status-changed', s))
  ipcMain.handle('google:status', () => google.status())
  ipcMain.handle('google:connect', () => google.connect())
  ipcMain.handle('google:disconnect', () => google.disconnect())
```

(with `import { GoogleAuth } from './google/auth'`)

- [ ] **Step 4: Preload + global.d.ts** — add to the exposed object:

```ts
  google: {
    status: (): Promise<GoogleStatus> => ipcRenderer.invoke('google:status'),
    connect: (): Promise<GoogleStatus> => ipcRenderer.invoke('google:connect'),
    disconnect: (): Promise<GoogleStatus> => ipcRenderer.invoke('google:disconnect')
  },
  onGoogleStatusChanged: subscribe<GoogleStatus>('google:status-changed')
```

and mirror in `global.d.ts` (import `GoogleStatus` from `@shared/types`).

- [ ] **Step 5: Gates + commit**

Run: `npm run typecheck && npm test && npm run build` — 57 tests, clean. (No unit tests for the network flow itself; 2b adds an injected-fetch API-client layer with tests. Manual end-to-end happens once the user supplies the Google Cloud client config.)

```bash
git add -A
git commit -m "feat: Google OAuth PKCE loopback flow with encrypted token storage"
```

---

### Task 5: Connect Google UI in the Today rail

**Files:**
- Modify: `src/renderer/src/components/TodayRail.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

**Interfaces:**
- `TodayRail({ night, google, onConnect }: { night: boolean; google: GoogleStatus; onConnect: () => void })` — 2b extends this with events.

- [ ] **Step 1: Replace `TodayRail.tsx` with:**

```tsx
import type { GoogleStatus } from '@shared/types'

export default function TodayRail(props: {
  night: boolean
  google: GoogleStatus
  onConnect: () => void
}) {
  return (
    <aside className="today-rail">
      <div className="section-label">Today</div>
      {props.google.state === 'connected' ? (
        <p className="placeholder-copy">
          Google connected{props.google.email ? ` as ${props.google.email}` : ''} ✓ — your
          calendar arrives in the next update.
        </p>
      ) : props.google.state === 'connecting' ? (
        <p className="placeholder-copy">A browser tab just opened — finish signing in there. 🌿</p>
      ) : props.google.state === 'unconfigured' ? (
        <p className="placeholder-copy">
          Google isn’t set up on this build yet — the person who installed Ollibeu can add the
          key. Everything else works without it.
        </p>
      ) : (
        <>
          <p className="placeholder-copy">
            Connect Google to see your day here — appointments, gentle “leave by” nudges, and
            what tomorrow looks like.
          </p>
          <button type="button" className="pill-button" onClick={props.onConnect}>
            Connect Google
          </button>
          {props.google.state === 'needs_reconnect' && (
            <p className="placeholder-copy">
              Google asked us to sign in again — one click and you’re set. 🍃
            </p>
          )}
        </>
      )}
      <p className="placeholder-copy">
        {props.night ? 'Rest is productive too. ✨' : 'One thing at a time. 🍃'}
      </p>
    </aside>
  )
}
```

- [ ] **Step 2: App.tsx wiring** — add state + subscription (in the same consolidated effect from Task 2):

```tsx
  const [google, setGoogle] = useState<GoogleStatus>({ state: 'disconnected' })
```

inside the main effect add:

```tsx
    void window.ollibeu.google.status().then(setGoogle)
    const offGoogle = window.ollibeu.onGoogleStatusChanged(setGoogle)
```

(and `offGoogle()` in the cleanup). Render:

```tsx
        <TodayRail night={night} google={google} onConnect={() => void window.ollibeu.google.connect().then(setGoogle)} />
```

Import `GoogleStatus` type in App.tsx.

- [ ] **Step 3: theme.css** — `.today-rail .pill-button { margin: 6px 0 10px; }` (append).

- [ ] **Step 4: Gates + commit + push branch**

Run: `npm run typecheck && npm test && npm run build` — clean.

```bash
git add -A
git commit -m "feat: Connect Google states in the Today rail"
git push -u origin feat/phase2a-store-oauth
```
