# Ollibeu Phase 3a: Event Creation, Settings, Idle Ding, Sounds, Rail Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Create calendar events from Ollibeu (user-approved scope expansion to `calendar.events`); a calm settings panel (name, theme, sounds, idle ding, launch-at-login); the opt-in idle ding (system-wide idle → gentle notification + soft chime, day hours only); WebAudio completion/idle chimes (no binary assets); and the accumulated rail polish backlog.

**Architecture:** Event insert goes through a shared `GoogleApi` instance constructed in `index.ts` (passed into SyncEngine); a `calendar:add-event` IPC returns a typed result (`ok | needs-reauth | unreachable`). IdleWatcher lives in main (powerMonitor.getSystemIdleTime), pushes `idle:ding` to the renderer for the chime and shows a silent Notification. Sounds are synthesized with WebAudio in the renderer. Settings panel is a renderer overlay writing through the existing `settings:set`.

## Global Constraints

- No-guilt copy rule. Idle ding copy: "Still with me? What were you working on? 🍃" — never alarming.
- Scope list becomes: `openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks`. Existing readonly tokens keep syncing (list still allowed); event INSERT with an old token fails `google-api:403` → the UI shows gentle copy + a "sign in again" button (disconnect→connect). No token migration machinery.
- Idle ding: default off; threshold default 10 min; fires only when `resolveTheme(now, settings) === 'day'`; self-snoozes 30 min after firing; never notifies in night mode.
- Sounds: default on via new `soundsEnabled: boolean` setting (add to Settings + DEFAULT_SETTINGS default true; storage forward-migration covers old files); every sound wrapped in try/catch — audio failures are silent.
- `launchAtLogin` toggle calls `app.setLoginItemSettings({ openAtLogin })` only when `app.isPackaged` (dev logs one line instead).
- All gates per commit: `npm run typecheck && npm test && npm run build` (95 baseline).
- Branch `feat/phase3a-features` from main. Commit messages exact.

## File Structure

```
src/shared/types.ts        — + soundsEnabled; AddEventInput; AddEventResult
src/shared/gcal.ts         — + nextDayStr, relativeSyncLabel, nextEventCountdown (pure, TDD)
src/main/google/api.ts     — + insertEvent(input)
src/main/google/auth.ts    — SCOPES swap (calendar.readonly → calendar.events)
src/main/idleWatcher.ts    — NEW: IdleWatcher
src/main/index.ts          — shared GoogleApi instance; calendar:add-event; idle watcher; login-item on settings change
src/preload/index.ts       — addEvent, onIdleDing
src/renderer/src/global.d.ts
src/renderer/src/sounds.ts — NEW: playChime('win' | 'ding') via WebAudio
src/renderer/src/components/SettingsPanel.tsx — NEW
src/renderer/src/components/AddEvent.tsx      — NEW (rail form)
src/renderer/src/components/TodayRail.tsx     — form mount + polish items
src/renderer/src/App.tsx   — settings button/panel state; chime hooks
src/renderer/src/theme.css — panel/form/now-marker styles; prefers-reduced-motion guards
tests/gcal.test.ts         — + new pure fn tests
tests/googleApi.test.ts    — + insertEvent tests
```

---

### Task 1: Pure helpers + types (TDD)

**Files:** `src/shared/types.ts`, `src/shared/gcal.ts`, `tests/gcal.test.ts`

**Interfaces:**
- types.ts: `soundsEnabled: boolean` on Settings (+ `soundsEnabled: true` in DEFAULT_SETTINGS);
```ts
export interface AddEventInput {
  title: string
  date: string // YYYY-MM-DD
  time?: string // HH:MM — absent = all-day
  durationMinutes?: number // default 60; ignored for all-day
}
export type AddEventResult = { ok: true } | { ok: false; reason: 'needs-reauth' | 'unreachable' }
```
- gcal.ts:
  - `nextDayStr(date: string): string` — "2026-07-11" → "2026-07-12" (month/year rollover via Date math).
  - `relativeSyncLabel(lastIso: string, now: Date): string` — <90s "synced just now"; <60min "synced N min ago"; else "synced at H:MM".
  - `nextEventCountdown(events: CalendarEvent[], now: Date): string | null` — next TIMED event today strictly after now: within 120 min → `"${title} in N min"`; today but later → `"${title} at H:MM"`; none → null.

- [ ] Append failing tests to `tests/gcal.test.ts`:

```ts
describe('nextDayStr', () => {
  it('increments including month and year rollovers', () => {
    expect(nextDayStr('2026-07-11')).toBe('2026-07-12')
    expect(nextDayStr('2026-07-31')).toBe('2026-08-01')
    expect(nextDayStr('2026-12-31')).toBe('2027-01-01')
  })
})

describe('relativeSyncLabel', () => {
  const now = new Date(2026, 6, 10, 14, 0)
  it('grades recency gently', () => {
    expect(relativeSyncLabel(new Date(2026, 6, 10, 13, 59, 30).toISOString(), now)).toBe('synced just now')
    expect(relativeSyncLabel(new Date(2026, 6, 10, 13, 35).toISOString(), now)).toBe('synced 25 min ago')
    expect(relativeSyncLabel(new Date(2026, 6, 10, 9, 15).toISOString(), now)).toMatch(/^synced at 9:15/)
  })
})

describe('nextEventCountdown', () => {
  const now = new Date(2026, 6, 10, 14, 0)
  it('counts down a near event in minutes', () => {
    const events = [ev({ id: 'd', title: 'Dentist', start: '2026-07-10T15:30:00', end: '2026-07-10T16:30:00' })]
    expect(nextEventCountdown(events, now)).toBe('Dentist in 90 min')
  })
  it('uses a clock time for later today, null otherwise', () => {
    const later = [ev({ id: 'l', title: 'Call', start: '2026-07-10T19:00:00', end: '2026-07-10T19:30:00' })]
    expect(nextEventCountdown(later, now)).toMatch(/^Call at 7:00/)
    expect(nextEventCountdown([], now)).toBeNull()
    const past = [ev({ id: 'p', start: '2026-07-10T09:00:00', end: '2026-07-10T10:00:00' })]
    expect(nextEventCountdown(past, now)).toBeNull()
  })
})
```

(reuse the existing `ev` factory; add `title` to its overrides usage as shown)

- [ ] RED → implement in gcal.ts:

```ts
export function nextDayStr(date: string): string {
  const d = new Date(date + 'T00:00:00')
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function relativeSyncLabel(lastIso: string, now: Date): string {
  const last = new Date(lastIso)
  if (Number.isNaN(last.getTime())) return ''
  const mins = Math.floor((now.getTime() - last.getTime()) / 60_000)
  if (mins < 2) return 'synced just now'
  if (mins < 60) return `synced ${mins} min ago`
  return `synced at ${last.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function nextEventCountdown(events: CalendarEvent[], now: Date): string | null {
  const upcoming = eventsForDay(events, now)
    .filter((e) => !e.allDay && eventStart(e) > now)
    .sort((a, b) => eventStart(a).getTime() - eventStart(b).getTime())[0]
  if (!upcoming) return null
  const mins = Math.round((eventStart(upcoming).getTime() - now.getTime()) / 60_000)
  if (mins <= 120) return `${upcoming.title} in ${mins} min`
  return `${upcoming.title} at ${eventStart(upcoming).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
```

plus the types.ts additions. GREEN → gates (95 + 7 = 102) → commit `feat: event-input types, next-day math, relative sync and countdown labels`

---

### Task 2: insertEvent API + scope swap (TDD)

**Files:** `src/main/google/api.ts`, `src/main/google/auth.ts`, `tests/googleApi.test.ts`

- [ ] Append failing tests:

```ts
  it('inserts a timed event with computed end', async () => {
    const { impl, calls } = stubFetch({ '/calendars/primary/events': {} })
    const api = new GoogleApi(token, impl)
    await api.insertEvent({ title: 'Coffee', date: '2026-07-12', time: '09:30', durationMinutes: 30 })
    expect(calls[0].init?.method).toBe('POST')
    const body = JSON.parse(calls[0].init?.body ?? '{}')
    expect(body.summary).toBe('Coffee')
    expect(body.start.dateTime).toContain('2026-07-12')
    expect(new Date(body.end.dateTime).getTime() - new Date(body.start.dateTime).getTime()).toBe(30 * 60_000)
  })

  it('inserts an all-day event with exclusive end date', async () => {
    const { impl, calls } = stubFetch({ '/calendars/primary/events': {} })
    const api = new GoogleApi(token, impl)
    await api.insertEvent({ title: 'Trip', date: '2026-07-31' })
    const body = JSON.parse(calls[0].init?.body ?? '{}')
    expect(body.start.date).toBe('2026-07-31')
    expect(body.end.date).toBe('2026-08-01')
  })
```

- [ ] RED → implement `insertEvent` in api.ts:

```ts
  async insertEvent(input: AddEventInput): Promise<void> {
    let payload: unknown
    if (input.time) {
      const start = new Date(`${input.date}T${input.time}:00`)
      const end = new Date(start.getTime() + (input.durationMinutes ?? 60) * 60_000)
      payload = {
        summary: input.title,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() }
      }
    } else {
      payload = {
        summary: input.title,
        start: { date: input.date },
        end: { date: nextDayStr(input.date) }
      }
    }
    await this.request(`${CAL}/calendars/primary/events`, {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }
```

(imports: `AddEventInput` from types, `nextDayStr` from gcal)
- [ ] auth.ts: swap `'https://www.googleapis.com/auth/calendar.readonly'` → `'https://www.googleapis.com/auth/calendar.events'` in SCOPES.
- [ ] GREEN → gates (104) → commit `feat: calendar event insertion and read-write events scope`

---

### Task 3: Wiring — shared api instance, add-event IPC, idle watcher, login item

**Files:** `src/main/idleWatcher.ts` (new), `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`

- [ ] `src/main/idleWatcher.ts`:

```ts
import { Notification, powerMonitor } from 'electron'
import type { DataStore } from './dataStore'
import { resolveTheme } from '../shared/theme'

const CHECK_MS = 60_000
const SNOOZE_MS = 30 * 60_000

export class IdleWatcher {
  private timer: NodeJS.Timeout | null = null
  private lastFiredAt = 0

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
    if (idleSeconds < settings.idleDing.thresholdMinutes * 60) return
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
```

- [ ] `src/main/index.ts` (success branch):
  - Construct once: `const api = new GoogleApi(() => google.getAccessToken())`; pass into the engine: `new SyncEngine(store, google, api)`.
  - Add handler:

```ts
  ipcMain.handle('calendar:add-event', async (_e, input: AddEventInput): Promise<AddEventResult> => {
    try {
      await api.insertEvent(input)
      void syncEngine.syncNow()
      return { ok: true }
    } catch (err) {
      const msg = (err as Error).message
      if (msg === 'google-api:403') return { ok: false, reason: 'needs-reauth' }
      return { ok: false, reason: 'unreachable' }
    }
  })
```

  - Idle watcher: `const idleWatcher = new IdleWatcher(store, () => broadcast('idle:ding', null)); idleWatcher.start()`
  - Login item: subscribe to store changes and apply on transitions:

```ts
  let lastOpenAtLogin: boolean | null = null
  store.onChange((d) => {
    const wanted = d.settings.launchAtLogin
    if (wanted === lastOpenAtLogin) return
    lastOpenAtLogin = wanted
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: wanted })
    } else {
      console.warn('[ollibeu] dev build: skipping login-item change, would set', wanted)
    }
  })
```

  (initialize `lastOpenAtLogin` from `store.get().settings.launchAtLogin` right after open, applying once at startup with the same isPackaged guard.)
- [ ] preload: `calendar: { addEvent: (input: AddEventInput): Promise<AddEventResult> => ipcRenderer.invoke('calendar:add-event', input) }` and `onIdleDing: subscribe<null>('idle:ding')`; mirror in global.d.ts.
- [ ] Gates (104 stay green) → commit `feat: add-event IPC, idle watcher, and login-item wiring`

---

### Task 4: Sounds + settings panel

**Files:** `src/renderer/src/sounds.ts` (new), `src/renderer/src/components/SettingsPanel.tsx` (new), `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

- [ ] `sounds.ts`:

```ts
export function playChime(kind: 'win' | 'ding'): void {
  try {
    const ctx = new AudioContext()
    const notes = kind === 'win' ? [523.25, 783.99] : [659.25]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(kind === 'win' ? 0.12 : 0.07, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.65)
    })
    window.setTimeout(() => void ctx.close(), 1200)
  } catch {
    // sound is a nicety, never an error
  }
}
```

- [ ] `SettingsPanel.tsx` — overlay panel; props `{ settings, onChange(patch), onClose }`:

```tsx
import type { Settings } from '@shared/types'

export default function SettingsPanel(props: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}) {
  const s = props.settings
  return (
    <div className="settings-overlay" role="dialog" aria-label="Settings">
      <div className="settings-panel card">
        <div className="settings-head">
          <div className="section-label">Settings</div>
          <button type="button" className="pill-button quiet" onClick={props.onClose}>
            done
          </button>
        </div>
        <label className="settings-row">
          <span>Your name</span>
          <input
            type="text"
            value={s.displayName}
            placeholder="what should we call you?"
            onChange={(e) => props.onChange({ displayName: e.target.value })}
          />
        </label>
        <label className="settings-row">
          <span>Theme</span>
          <select
            value={s.theme}
            onChange={(e) => props.onChange({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="auto">day &amp; night (auto)</option>
            <option value="day">always day</option>
            <option value="night">always night</option>
          </select>
        </label>
        <label className="settings-row">
          <span>Gentle sounds</span>
          <input
            type="checkbox"
            checked={s.soundsEnabled}
            onChange={(e) => props.onChange({ soundsEnabled: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          <span>Nudge me when I drift</span>
          <input
            type="checkbox"
            checked={s.idleDing.enabled}
            onChange={(e) => props.onChange({ idleDing: { ...s.idleDing, enabled: e.target.checked } })}
          />
        </label>
        {s.idleDing.enabled && (
          <label className="settings-row">
            <span>after this many quiet minutes</span>
            <input
              type="number"
              min={3}
              max={120}
              value={s.idleDing.thresholdMinutes}
              onChange={(e) =>
                props.onChange({
                  idleDing: { ...s.idleDing, thresholdMinutes: Math.max(3, Number(e.target.value) || 10) }
                })
              }
            />
          </label>
        )}
        <label className="settings-row">
          <span>Open Ollibeu when the computer starts</span>
          <input
            type="checkbox"
            checked={s.launchAtLogin}
            onChange={(e) => props.onChange({ launchAtLogin: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          <span>Daily quote</span>
          <input
            type="checkbox"
            checked={s.quotesEnabled}
            onChange={(e) => props.onChange({ quotesEnabled: e.target.checked })}
          />
        </label>
      </div>
    </div>
  )
}
```

- [ ] App.tsx: `const [settingsOpen, setSettingsOpen] = useState(false)`; a quiet gear button rendered top-right (`<button type="button" className="settings-button" aria-label="Settings" onClick={() => setSettingsOpen(true)}>⚙</button>` placed just inside the top-level fragment); panel rendered when open with `onChange={(patch) => void window.ollibeu.mutate.setSettings(patch)}`; chime hooks: in `completeTask`, after `setJustDoneId(id)`, add `if (data?.settings.soundsEnabled) playChime('win')`; idle ding subscription in the consolidated effect: `const offDing = window.ollibeu.onIdleDing(() => { if (dataRef.current?.settings.soundsEnabled) playChime('ding') })` — add a `dataRef` (`useRef<OllibeuData | null>(null)`; assign `dataRef.current = data` in a small effect) so the handler reads fresh settings; unsubscribe in cleanup.
- [ ] theme.css:

```css
.settings-button {
  position: fixed;
  top: 14px;
  right: 16px;
  border: none;
  background: transparent;
  color: var(--text-faint);
  font-size: 17px;
  cursor: pointer;
}
.settings-button:hover { color: var(--accent-soft); }

.settings-overlay {
  position: fixed;
  inset: 0;
  background: color-mix(in srgb, var(--bg-a) 55%, transparent);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}
.settings-panel { width: 380px; max-width: 92vw; padding: 18px; }
.settings-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.settings-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  padding: 8px 0;
  border-bottom: 1px solid var(--card-border);
}
.settings-row:last-child { border-bottom: none; }
.settings-row input[type='text'],
.settings-row input[type='number'],
.settings-row select {
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  max-width: 170px;
}
.settings-row input[type='number'] { width: 64px; }
```

- [ ] Gates → commit `feat: settings panel, gentle chimes, idle-ding sound hook`

---

### Task 5: Add-event form in the rail

**Files:** `src/renderer/src/components/AddEvent.tsx` (new), `src/renderer/src/components/TodayRail.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

- [ ] `AddEvent.tsx`:

```tsx
import { useState } from 'react'
import type { AddEventInput, AddEventResult } from '@shared/types'

export default function AddEvent(props: {
  onAdd: (input: AddEventInput) => Promise<AddEventResult>
  onReauth: () => void
  today: string // YYYY-MM-DD
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(props.today)
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<'needs-reauth' | 'unreachable' | null>(null)

  if (!open) {
    return (
      <button type="button" className="link-button rail-add" onClick={() => setOpen(true)}>
        + add to calendar
      </button>
    )
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !date || busy) return
    setBusy(true)
    setTrouble(null)
    void props
      .onAdd({ title: trimmed, date, ...(time ? { time, durationMinutes: duration } : {}) })
      .then((result) => {
        if (result.ok) {
          setTitle('')
          setTime('')
          setOpen(false)
        } else {
          setTrouble(result.reason)
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <form className="add-event" onSubmit={submit}>
      <input
        type="text"
        placeholder="what's happening?"
        aria-label="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="add-event-when">
        <input type="date" aria-label="Event date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" aria-label="Event time (optional)" value={time} onChange={(e) => setTime(e.target.value)} />
        {time && (
          <select aria-label="Duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        )}
      </div>
      <div className="add-event-actions">
        <button type="submit" className="pill-button" disabled={busy}>
          {busy ? 'adding…' : 'add'}
        </button>
        <button type="button" className="pill-button quiet" onClick={() => setOpen(false)}>
          never mind
        </button>
      </div>
      {trouble === 'unreachable' && (
        <p className="placeholder-copy">Couldn’t reach Google just now — worth another try in a moment. 🍃</p>
      )}
      {trouble === 'needs-reauth' && (
        <p className="placeholder-copy">
          Google needs a fresh sign-in before Ollibeu can add events.{' '}
          <button type="button" className="link-button" onClick={props.onReauth}>
            sign in again
          </button>
        </p>
      )}
    </form>
  )
}
```

- [ ] TodayRail: add props `onAddEvent: (input: AddEventInput) => Promise<AddEventResult>` and `onReauth: () => void`; in the CONNECTED branch, render `<AddEvent onAdd={props.onAddEvent} onReauth={props.onReauth} today={toDateStr(props.now)} />` after the tomorrow/synced lines (`toDateStr` = small local helper formatting YYYY-MM-DD from a Date with padStart).
- [ ] App.tsx: pass `onAddEvent={(input) => window.ollibeu.calendar.addEvent(input)}` and `onReauth={() => void window.ollibeu.google.disconnect().then(() => window.ollibeu.google.connect()).catch(() => {})}`.
- [ ] theme.css:

```css
.rail-add { display: block; margin-top: 8px; font-size: 12px; }
.add-event { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; }
.add-event input[type='text'],
.add-event input[type='date'],
.add-event input[type='time'],
.add-event select {
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text);
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  min-width: 0;
}
.add-event-when { display: flex; flex-wrap: wrap; gap: 6px; }
.add-event-actions { display: flex; gap: 8px; }
```

- [ ] Gates → commit `feat: add calendar events from the Today rail`

---

### Task 6: Rail polish backlog

**Files:** `src/renderer/src/components/TodayRail.tsx`, `src/main/google/sync.ts`, `src/renderer/src/theme.css`

- [ ] Countdown line: in the connected branch, above the timeline: `{countdown && <p className="rail-countdown">{countdown}</p>}` with `const countdown = nextEventCountdown(events, props.now)`.
- [ ] Now marker: while mapping `todayEvents`, insert ONE `<div key="now" className="rail-now">now</div>` before the first event whose start is after `props.now` (timed events only; if all events started/all-day, marker renders after the list). Implementation: compute `const nowIdx = todayEvents.findIndex((e) => !e.allDay && new Date(e.start) > props.now)` and render the marker at that index (or at the end when `nowIdx === -1 && todayEvents.length > 0`).
- [ ] Relative sync stamp: replace the absolute time with `relativeSyncLabel(props.calendar.lastSyncedAt, props.now)`.
- [ ] Pre-first-sync state: when `props.google.state === 'connected' && !props.calendar`, render `<p className="placeholder-copy">Checking your calendar… 🌿</p>` instead of the timeline/empty copy.
- [ ] Evening line: when `props.night` and there are no upcoming timed events left today (`nextEventCountdown(events, props.now) === null`), the existing night line becomes `Your evening is yours. Rest is productive too. ✨` (replace the current night string).
- [ ] Sync on unlock: in `SyncEngine.start()`, alongside resume: `powerMonitor.on('unlock-screen', this.handleResume)` (and remove in `stop()`).
- [ ] Rail growth cap: `.rail-timeline { max-height: 300px; overflow-y: auto; }` + reuse the thin scrollbar rules.
- [ ] Reduced motion: wrap the `confetti-fly` usage and `pop-done` animation declarations:

```css
@media (prefers-reduced-motion: reduce) {
  .confetti-piece { animation: none; opacity: 0; }
  .task-card.done { animation: none; }
}
```

- [ ] Gates → commit `feat: rail polish — countdown, now marker, relative sync, unlock trigger, reduced motion`
- [ ] `git push -u origin feat/phase3a-features`
