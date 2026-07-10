import { contextBridge, ipcRenderer } from 'electron'
import type { OllibeuData } from '../shared/types'

contextBridge.exposeInMainWorld('ollibeu', {
  loadData: (): Promise<OllibeuData> => ipcRenderer.invoke('data:load'),
  saveData: (data: OllibeuData): Promise<void> => ipcRenderer.invoke('data:save', data)
})
