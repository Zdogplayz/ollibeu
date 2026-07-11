import { Notification, powerMonitor } from 'electron'
import type { DataStore } from './dataStore'
import { resolveTheme } from '../shared/theme'

const CHECK_MS = 60_000
const SNOOZE_MS = 30 * 60_000

export class IdleWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastFiredAt = 0
  private armed = false

  constructor(
    private readonly store: DataStore,
    private readonly onDing: () => void
  ) {}

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => this.check(), CHECK_MS)
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  }

  private check(): void {
    const settings = this.store.get().settings
    if (!settings.idleDing.enabled) return
    const now = new Date()
    if (resolveTheme(now, settings) !== 'day') return
    if (Date.now() - this.lastFiredAt < SNOOZE_MS) return
    const idleSeconds = powerMonitor.getSystemIdleTime()
    if (idleSeconds < settings.idleDing.thresholdMinutes * 60) {
      // real activity observed — re-arm for the next drift
      this.armed = true
      return
    }
    if (!this.armed) return
    this.armed = false
    this.lastFiredAt = Date.now()
    try {
      new Notification({
        title: 'Ollibeu',
        body: 'Still with me? What were you working on? 🍃',
        silent: true
      }).show()
    } catch (err) {
      console.error('[ollibeu] notification unavailable', err)
    }
    this.onDing()
  }
}
