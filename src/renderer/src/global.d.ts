import type { AppState, GoogleStatus, OllibeuData, Settings, Task } from '@shared/types'

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
      google: {
        status(): Promise<GoogleStatus>
        connect(): Promise<GoogleStatus>
        disconnect(): Promise<GoogleStatus>
      }
      onGoogleStatusChanged(cb: (s: GoogleStatus) => void): () => void
    }
  }
}

export {}
