import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import type { OllibeuData } from '../shared/types'
import { loadData, saveData } from './storage'

const dataPath = (): string => path.join(app.getPath('userData'), 'ollibeu-data.json')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    backgroundColor: '#f2f5ef',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') }
  })
  win.once('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('data:load', () => loadData(dataPath()))
  ipcMain.handle('data:save', (_event, data: OllibeuData) => saveData(dataPath(), data))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
