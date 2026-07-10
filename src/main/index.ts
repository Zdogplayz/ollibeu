import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import type { AppState, Settings, Task } from '../shared/types'
import { DataStore } from './dataStore'
import { GoogleAuth } from './google/auth'

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
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
