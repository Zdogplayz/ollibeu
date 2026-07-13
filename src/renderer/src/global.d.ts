import type {
  AddEventInput,
  AddEventResult,
  AppState,
  GoogleStatus,
  OllibeuData,
  Settings,
  Task,
  UpdateHint
} from '@shared/types'

declare global {
  interface Window {
    ollibeu: {
      getData(): Promise<OllibeuData>
      getSaveTrouble(): Promise<boolean>
      mutate: {
        addTask(task: Task): Promise<void>
        completeTask(id: string, completedAt: string): Promise<void>
        snoozeTask(id: string, untilIso: string): Promise<void>
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
      onReminder(cb: (r: { title: string; body: string }) => void): () => void
      getUpdateHint(): Promise<UpdateHint>
      onUpdateHint(cb: (h: UpdateHint) => void): () => void
      openReleasePage(url: string): Promise<void>
    }
  }
}

export {}
