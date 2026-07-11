import { powerMonitor } from 'electron'
import type { DataStore } from '../dataStore'
import type { GoogleAuth } from './auth'
import { GoogleApi } from './api'
import { mergeGtasks } from '../../shared/gtasksMerge'

const SYNC_INTERVAL_MS = 5 * 60_000

export class SyncEngine {
  private readonly api: GoogleApi
  private timer: NodeJS.Timeout | null = null
  private running = false
  private unsubscribeAuth: (() => void) | null = null
  private readonly handleResume = (): void => {
    void this.syncNow()
  }

  constructor(
    private readonly store: DataStore,
    private readonly auth: GoogleAuth,
    api?: GoogleApi
  ) {
    this.api = api ?? new GoogleApi(() => auth.getAccessToken())
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => void this.syncNow(), SYNC_INTERVAL_MS)
    powerMonitor.on('resume', this.handleResume)
    powerMonitor.on('unlock-screen', this.handleResume)
    this.unsubscribeAuth = this.auth.onStatusChange((s) => {
      if (s.state === 'connected') void this.syncNow()
    })
    if (this.auth.status().state === 'connected') void this.syncNow()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    powerMonitor.removeListener('resume', this.handleResume)
    powerMonitor.removeListener('unlock-screen', this.handleResume)
    this.unsubscribeAuth?.()
    this.unsubscribeAuth = null
  }

  async syncNow(): Promise<void> {
    if (this.running || this.auth.status().state !== 'connected') return
    this.running = true
    try {
      const now = new Date()
      const nowIso = now.toISOString()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const windowEnd = new Date(dayStart.getTime() + 2 * 86_400_000)
      const [events, { tasks: remoteTasks, complete }] = await Promise.all([
        this.api.listEvents(dayStart.toISOString(), windowEnd.toISOString()),
        this.api.listAllTasks()
      ])
      const mergeOpts = { skipDeletions: !complete }
      // This pre-fetch merge exists only to compute which items need a completion
      // upload. Its `tasks` list must NOT be written to the store below: the upload
      // loop awaits one PATCH per item, and a task:add / task:complete can land in
      // the live store during those awaits. The mutate callback re-merges against
      // the store's state at write-time so such edits are never dropped.
      const preMerge = mergeGtasks(this.store.get().tasks, remoteTasks, nowIso, mergeOpts)

      const uploaded = new Set<string>()
      for (const item of preMerge.toComplete) {
        try {
          await this.api.patchTaskCompleted(item.listId, item.taskId)
          uploaded.add(`${item.listId}:${item.taskId}`)
        } catch (err) {
          const message = (err as Error).message
          if (message === 'google-api:404' || message === 'google-api:410') {
            uploaded.add(`${item.listId}:${item.taskId}`)
            console.error('[ollibeu] completed task no longer exists in Google; letting it go')
          } else {
            console.error('[ollibeu] task completion upload will retry next sync', err)
          }
        }
      }

      await this.store.mutate((d) => {
        const merged = mergeGtasks(d.tasks, remoteTasks, nowIso, mergeOpts)
        const finalTasks = merged.tasks.map((t) =>
          t.gtasksId && t.gtasksListId && uploaded.has(`${t.gtasksListId}:${t.gtasksId}`)
            ? { ...t, gtasksSyncPending: undefined }
            : t
        )
        return {
          ...d,
          tasks: finalTasks,
          calendar: { events, lastSyncedAt: nowIso },
          appState:
            d.appState.activeTaskId && !finalTasks.some((t) => t.id === d.appState.activeTaskId)
              ? {}
              : d.appState
        }
      })
    } catch (err) {
      const message = (err as Error).message
      if (message === 'google-api:401') {
        this.auth.expireAccessToken()
        console.error('[ollibeu] auth expired mid-sync; will refresh next cycle')
      } else if (message !== 'needs_reconnect') {
        console.error('[ollibeu] sync postponed; keeping cached data', err)
      }
    } finally {
      this.running = false
    }
  }
}
