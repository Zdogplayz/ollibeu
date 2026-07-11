import type {
  AddEventInput,
  AddEventResult,
  AppState,
  GoogleStatus,
  OllibeuData,
  Settings,
  Task
} from '@shared/types'

declare global {
  interface Window {
    ollibeu: {
      getData(): Promise<OllibeuData>
      getSaveTrouble(): Promise<boolean>
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
        setConfig(input: { clientId: string; clientSecret?: string }): Promise<GoogleStatus>
        clearConfig(): Promise<GoogleStatus>
      }
      onGoogleStatusChanged(cb: (s: GoogleStatus) => void): () => void
      syncNow(): Promise<void>
      calendar: {
        addEvent(input: AddEventInput): Promise<AddEventResult>
      }
      onIdleDing(cb: (d: null) => void): () => void
    }
  }
}

export {}
