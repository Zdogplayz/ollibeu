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
    this.unsubscribeAuth = this.auth.onStatusChange((s) => {
      if (s.state === 'connected') void this.syncNow()
    })
    if (this.auth.status().state === 'connected') void this.syncNow()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    powerMonitor.removeListener('resume', this.handleResume)
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
      const [events, remoteTasks] = await Promise.all([
        this.api.listEvents(dayStart.toISOString(), windowEnd.toISOString()),
        this.api.listAllTasks()
      ])
      // This pre-fetch merge exists only to compute which items need a completion
      // upload. Its `tasks` list must NOT be written to the store below: the upload
      // loop awaits one PATCH per item, and a task:add / task:complete can land in
      // the live store during those awaits. The mutate callback re-merges against
      // the store's state at write-time so such edits are never dropped.
      const preMerge = mergeGtasks(this.store.get().tasks, remoteTasks, nowIso)

      const uploaded = new Set<string>()
      for (const item of preMerge.toComplete) {
        try {
          await this.api.patchTaskCompleted(item.listId, item.taskId)
          uploaded.add(`${item.listId}:${item.taskId}`)
        } catch (err) {
          console.error('[ollibeu] task completion upload will retry next sync', err)
        }
      }

      await this.store.mutate((d) => {
        const merged = mergeGtasks(d.tasks, remoteTasks, nowIso)
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
      if ((err as Error).message !== 'needs_reconnect') {
        console.error('[ollibeu] sync postponed; keeping cached data', err)
      }
    } finally {
      this.running = false
    }
  }
}
