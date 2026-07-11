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
    powerMonitor.on('resume', () => void this.syncNow())
    this.auth.onStatusChange((s) => {
      if (s.state === 'connected') void this.syncNow()
    })
    if (this.auth.status().state === 'connected') void this.syncNow()
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  async syncNow(): Promise<void> {
    if (this.running || this.auth.status().state !== 'connected') return
    this.running = true
    try {
      const now = new Date()
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const windowEnd = new Date(dayStart.getTime() + 2 * 86_400_000)
      const [events, remoteTasks] = await Promise.all([
        this.api.listEvents(dayStart.toISOString(), windowEnd.toISOString()),
        this.api.listAllTasks()
      ])
      const merged = mergeGtasks(this.store.get().tasks, remoteTasks, now.toISOString())

      const uploaded = new Set<string>()
      for (const item of merged.toComplete) {
        try {
          await this.api.patchTaskCompleted(item.listId, item.taskId)
          uploaded.add(item.taskId)
        } catch (err) {
          console.error('[ollibeu] task completion upload will retry next sync', err)
        }
      }

      const finalTasks = merged.tasks.map((t) =>
        t.gtasksId && uploaded.has(t.gtasksId) ? { ...t, gtasksSyncPending: undefined } : t
      )

      await this.store.mutate((d) => ({
        ...d,
        tasks: finalTasks,
        calendar: { events, lastSyncedAt: now.toISOString() },
        appState:
          d.appState.activeTaskId && !finalTasks.some((t) => t.id === d.appState.activeTaskId)
            ? {}
            : d.appState
      }))
    } catch (err) {
      if ((err as Error).message !== 'needs_reconnect') {
        console.error('[ollibeu] sync postponed; keeping cached data', err)
      }
    } finally {
      this.running = false
    }
  }
}
