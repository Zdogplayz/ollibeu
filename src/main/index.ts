import { app, BrowserWindow, globalShortcut, ipcMain, shell } from 'electron'
import path from 'path'
import { randomUUID } from 'node:crypto'
import type {
  AddEventInput,
  AddEventResult,
  AppState,
  Settings,
  Task,
  UpdateHint
} from '../shared/types'
import { completeRecurring } from '../shared/recurrence'
import { DataStore } from './dataStore'
import { GoogleAuth } from './google/auth'
import { GoogleApi } from './google/api'
import { SyncEngine } from './google/sync'
import { IdleWatcher } from './idleWatcher'
import { startUpdateFlow } from './updater'

const dataPath = (): string => path.join(app.getPath('userData'), 'ollibeu-data.json')

// Windows toast banners require the app's user-model id to be registered and
// to match the installer's appId — without this, Notifications never appear.
app.setAppUserModelId('app.ollibeu')

function focusOllibeu(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  } else {
    createWindow()
  }
}

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

let captureWin: BrowserWindow | null = null

function openCapture(): void {
  if (captureWin && !captureWin.isDestroyed()) {
    captureWin.show()
    captureWin.focus()
    return
  }
  captureWin = new BrowserWindow({
    width: 440,
    height: 84,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: '#f2f5ef',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') }
  })
  captureWin.once('ready-to-show', () => captureWin?.show())
  captureWin.on('blur', () => captureWin?.close())
  captureWin.on('closed', () => {
    captureWin = null
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    captureWin.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/capture.html`)
  } else {
    captureWin.loadFile(path.join(__dirname, '../renderer/capture.html'))
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
    await store.mutate((d) => {
      const dones: Task[] = []
      const tasks = d.tasks.map((t) => {
        if (t.id !== id) return t
        if (t.source === 'local' && t.repeat) {
          try {
            const { done, next } = completeRecurring(t, completedAt, randomUUID())
            dones.push(done)
            return next
          } catch {
            console.warn('[ollibeu] recurrence skipped for malformed task', t.id)
          }
        }
        if (t.source === 'gtasks') wasGtasks = true
        return { ...t, completedAt, ...(t.source === 'gtasks' ? { gtasksSyncPending: true } : {}) }
      })
      return {
        ...d,
        tasks: [...tasks, ...dones],
        appState: d.appState.activeTaskId === id ? {} : d.appState
      }
    })
    if (wasGtasks) void syncEngine.syncNow()
  })
  ipcMain.handle('task:snooze', (_e, id: string, untilIso: string) =>
    store.mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, snoozedUntil: untilIso } : t)),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
  )
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

  const idleWatcher = new IdleWatcher(store, () => broadcast('idle:ding', null), focusOllibeu)
  idleWatcher.start()

  let lastHint: UpdateHint = { available: false, current: app.getVersion() }
  startUpdateFlow((h) => {
    lastHint = h
    broadcast('update:hint', h)
  })
  ipcMain.handle('update:get-hint', () => lastHint)
  ipcMain.handle('shell:open-release', (_e, url: string) => {
    if (typeof url === 'string' && url.startsWith('https://github.com/Zdogplayz/ollibeu/')) {
      void shell.openExternal(url)
    }
  })

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

  let lastCaptureEnabled: boolean | null = null
  let captureShortcutRegistered = false
  const syncCaptureShortcut = (enabled: boolean): void => {
    if (enabled === lastCaptureEnabled) return
    lastCaptureEnabled = enabled
    if (enabled) {
      captureShortcutRegistered = globalShortcut.register('CommandOrControl+Shift+O', openCapture)
      if (!captureShortcutRegistered) {
        console.warn('[ollibeu] quick-capture shortcut unavailable (already in use elsewhere)')
      }
    } else if (captureShortcutRegistered) {
      globalShortcut.unregister('CommandOrControl+Shift+O')
      captureShortcutRegistered = false
    }
  }
  syncCaptureShortcut(store.get().settings.quickCaptureEnabled)
  store.onChange((d) => syncCaptureShortcut(d.settings.quickCaptureEnabled))

  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
})
