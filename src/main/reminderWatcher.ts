import { Notification } from 'electron'
import type { DataStore } from './dataStore'
import { dueReminders } from '../shared/reminders'

const POLL_MS = 30_000

export class ReminderWatcher {
  private timer: NodeJS.Timeout | null = null
  private fired = new Set<string>()

  constructor(
    private readonly store: DataStore,
    private readonly onReminder: (r: { title: string; body: string }) => void,
    private readonly onBannerClick?: () => void
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.check(), POLL_MS)
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private check(): void {
    const data = this.store.get()
    if (!data.settings.remindersEnabled) return
    const now = new Date()
    const due = dueReminders(data.tasks, data.calendar?.events ?? [], now, {
      leaveByBufferMinutes: data.settings.leaveByBufferMinutes,
      taskReminderMinutes: data.settings.taskReminderMinutes,
      windowMs: POLL_MS + 5_000 // small overlap so a reminder is never skipped between ticks
    })
    for (const r of due) {
      if (this.fired.has(r.key)) continue
      this.fired.add(r.key)
      try {
        const banner = new Notification({ title: r.title, body: r.body, silent: true })
        banner.on('click', () => this.onBannerClick?.())
        banner.show()
      } catch (err) {
        console.error('[ollibeu] reminder notification unavailable', err)
      }
      this.onReminder({ title: r.title, body: r.body })
    }
    // bound the fired set: a rare full clear may re-fire one in-window reminder
    // once (never a storm), matching the plan's accepted in-memory tolerance
    if (this.fired.size > 500) this.fired.clear()
  }
}
