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
