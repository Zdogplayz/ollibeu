import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import type { AddEventInput, AddEventResult, AppState, Settings, Task } from '../shared/types'
import { DataStore } from './dataStore'
import { GoogleAuth } from './google/auth'
import { GoogleApi } from './google/api'
import { SyncEngine } from './google/sync'
import { IdleWatcher } from './idleWatcher'

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
  const google = await GoogleAuth.create(app.getPath('userData'))
  google.onStatusChange((s) => broadcast('google:status-changed', s))
  ipcMain.handle('google:status', () => google.status())
  ipcMain.handle('google:connect', () => google.connect())
  ipcMain.handle('google:disconnect', () => google.disconnect())
  ipcMain.handle('google:set-config', (_e, input: { clientId: string; clientSecret?: string }) =>
    google.setClientConfig(input)
  )
  ipcMain.handle('google:clear-config', () => google.clearClientConfig())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })

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
  ipcMain.handle('data:trouble-state', () => store.troubleState())
  ipcMain.handle('task:add', (_e, task: Task) =>
    store.mutate((d) => ({ ...d, tasks: [...d.tasks, task] }))
  )
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) =>
    store.mutate((d) => ({ ...d, settings: { ...d.settings, ...patch } }))
  )
  ipcMain.handle('appstate:set', (_e, patch: Partial<AppState>) =>
    store.mutate((d) => ({ ...d, appState: { ...d.appState, ...patch } }))
  )

  const api = new GoogleApi(() => google.getAccessToken())
  const syncEngine = new SyncEngine(store, google, api)

  ipcMain.handle('task:complete', async (_e, id: string, completedAt: string) => {
    let wasGtasks = false
    await store.mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => {
        if (t.id !== id) return t
        if (t.source === 'gtasks') wasGtasks = true
        return { ...t, completedAt, ...(t.source === 'gtasks' ? { gtasksSyncPending: true } : {}) }
      }),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
    if (wasGtasks) void syncEngine.syncNow()
  })
  ipcMain.handle('sync:now', () => syncEngine.syncNow())

  ipcMain.handle('calendar:add-event', async (_e, input: AddEventInput): Promise<AddEventResult> => {
    try {
      await api.insertEvent(input)
      void syncEngine.syncNow()
      return { ok: true }
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'google-api:403') return { ok: false, reason: 'needs-reauth' }
      if (msg === 'google-api:401') {
        google.expireAccessToken()
        return { ok: false, reason: 'unreachable' }
      }
      return { ok: false, reason: 'unreachable' }
    }
  })

  syncEngine.start()

  const idleWatcher = new IdleWatcher(store, () => broadcast('idle:ding', null))
  idleWatcher.start()

  let lastOpenAtLogin: boolean | null = null
  const applyLoginItem = (wanted: boolean): void => {
    if (wanted === lastOpenAtLogin) return
    lastOpenAtLogin = wanted
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: wanted })
    } else {
      console.warn('[ollibeu] dev build: skipping login-item change, would set', wanted)
    }
  }
  applyLoginItem(store.get().settings.launchAtLogin)
  store.onChange((d) => applyLoginItem(d.settings.launchAtLogin))

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
