export type Importance = 'high' | 'medium' | 'low'
export type TaskSource = 'local' | 'gtasks'
export type TaskSortMode = 'importance' | 'soonest'

export interface AddEventInput {
  title: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM — absent = all-day
  durationMinutes?: number // default 60; ignored for all-day
}

export type AddEventResult = { ok: true } | { ok: false; reason: 'needs-reauth' | 'unreachable' }

export interface CalendarEvent {
  id: string
  title: string
  start: string // ISO datetime, or "YYYY-MM-DD" for all-day
  end: string
  allDay: boolean
}

export interface CalendarCache {
  events: CalendarEvent[]
  lastSyncedAt: string // ISO datetime
}

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
  gtasksSyncPending?: boolean
  repeat?: 'daily' | 'weekly' | 'monthly'
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
  soundsEnabled: boolean
  leaveByBufferMinutes: number
  launchAtLogin: boolean
  taskSort: TaskSortMode
  onboarded: boolean
  gardenEnabled: boolean
  quickCaptureEnabled: boolean
  remindersEnabled: boolean
  taskReminderMinutes: number
}

export interface AppState {
  activeTaskId?: string // task pinned via "I'll do this one"
}

export interface OllibeuData {
  tasks: Task[]
  settings: Settings
  appState: AppState
  calendar?: CalendarCache
}

export interface GoogleStatus {
  state: 'unconfigured' | 'disconnected' | 'connecting' | 'connected' | 'needs_reconnect'
  email?: string
  connectUrl?: string // present while connecting; copy-link fallback if no browser opened
}

export type UpdateHint =
  | { available: false; current: string }
  | { available: true; current: string; version: string; url: string }

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  theme: 'auto',
  nightStartsAt: '18:30',
  dayStartsAt: '06:30',
  idleDing: { enabled: false, thresholdMinutes: 10 },
  gamificationEnabled: false,
  quotesEnabled: true,
  soundsEnabled: true,
  leaveByBufferMinutes: 25,
  launchAtLogin: true,
  taskSort: 'importance',
  onboarded: false,
  gardenEnabled: true,
  quickCaptureEnabled: true,
  remindersEnabled: true,
  taskReminderMinutes: 10
}
