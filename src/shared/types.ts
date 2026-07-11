export type Importance = 'high' | 'medium' | 'low'
export type TaskSource = 'local' | 'gtasks'
export type TaskSortMode = 'importance' | 'soonest'

export interface Task {
  id: string
  title: string
  importance: Importance
  source: TaskSource
  gtasksId?: string
  gtasksListId?: string
  dueDate?: string // ISO date "YYYY-MM-DD"
  dueTime?: string // "HH:MM" 24h, only meaningful with dueDate
  estimateMinutes?: number
  createdAt: string // ISO datetime
  completedAt?: string // ISO datetime
  snoozedUntil?: string // ISO datetime
}

export interface IdleDingSettings {
  enabled: boolean
  thresholdMinutes: number
}

export interface Settings {
  displayName: string
  theme: 'auto' | 'day' | 'night'
  nightStartsAt: string // "HH:MM" 24h
  dayStartsAt: string // "HH:MM" 24h
  idleDing: IdleDingSettings
  gamificationEnabled: boolean
  quotesEnabled: boolean
  leaveByBufferMinutes: number
  launchAtLogin: boolean
  taskSort: TaskSortMode
}

export interface AppState {
  activeTaskId?: string // task pinned via "I'll do this one"
}

export interface OllibeuData {
  tasks: Task[]
  settings: Settings
  appState: AppState
}

export interface GoogleStatus {
  state: 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'needs_reconnect'
  email?: string
  connectUrl?: string // present while connecting; copy-link fallback if no browser opened
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  theme: 'auto',
  nightStartsAt: '18:30',
  dayStartsAt: '06:30',
  idleDing: { enabled: false, thresholdMinutes: 10 },
  gamificationEnabled: false,
  quotesEnabled: true,
  leaveByBufferMinutes: 25,
  launchAtLogin: true,
  taskSort: 'importance'
}
