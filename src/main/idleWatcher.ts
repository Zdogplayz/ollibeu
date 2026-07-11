import { Notification, powerMonitor } from 'electron'
import type { DataStore } from './dataStore'
import { resolveTheme } from '../shared/theme'

const CHECK_MS = 60_000
const SNOOZE_MS = 30 * 60_000

export class IdleWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastFiredAt = 0
  private armed = false
  private activeBanner: Notification | null = null

  constructor(
    private readonly store: DataStore,
    private readonly onDing: () => void,
    private readonly onBannerClick?: () => void
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
      const banner = new Notification({
        title: 'Still with me? 🍃',
        body: 'No rush — just checking in. Click to come back to Ollibeu.',
        silent: true // the in-app chime carries the sound, honoring the sounds toggle
      })
      banner.on('click', () => this.onBannerClick?.())
      banner.on('close', () => {
        if (this.activeBanner === banner) this.activeBanner = null
      })
      // hold a reference so the banner isn't GC'd before a late click arrives
      this.activeBanner = banner
      banner.show()
    } catch (err) {
      console.error('[ollibeu] notification unavailable', err)
    }
    this.onDing()
  }
}
