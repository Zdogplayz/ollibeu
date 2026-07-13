# Ollibeu v0.2.2: Event & Task Reminders

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Gentle banner + in-app reminders before scheduled things: a "get ready" ping ahead of each timed calendar event (at start − leaveByBufferMinutes), and a lead-time ping before each timed task (at dueDateTime − taskReminderMinutes). Default ON, toggleable; never guilt-toned; each reminder fires at most once per occurrence.

**Architecture:** Pure `src/shared/reminders.ts` decides which reminders are "due to fire" for a given `now` (fully TDD). A main-process `ReminderWatcher` (mirrors `IdleWatcher`) polls every 30s, dedups via an in-memory fired-key set, fires a native `Notification` (banner) and broadcasts `reminder:show` with the copy. The renderer reuses the existing floating-nudge card to show the same message on-screen (so it lands even when the OS suppresses banners for the focused app — same rationale as the idle nudge).

## Global Constraints

- No-guilt copy: reminders are warm and optional-feeling ("a good moment to get ready", "whenever you're ready") — never "due now!", never a count of misses.
- New Settings: `remindersEnabled: boolean` (default **true**), `taskReminderMinutes: number` (default 10). Storage default-merge covers old files. Event lead time REUSES the existing `leaveByBufferMinutes` (default 25).
- Fire only for: timed calendar events (not all-day), and tasks with BOTH `dueDate` and `dueTime`, not completed, not snoozed-into-the-future. A reminder never fires if its target time is already in the past at first observation by more than the poll window (no "catch-up" spam on launch).
- Occurrence key includes the local date so a daily recurring task reminds each day; the fired-set is in-memory (a restart may re-fire a still-upcoming reminder at most once — acceptable, never a storm).
- Reminders respect neither day/night gating nor idle state — a scheduled thing is a scheduled thing. But they DO honor `remindersEnabled`.
- Banner uses the same silent+AUMID path as the idle watcher; click focuses the app (reuse `focusOllibeu`). The in-app nudge reuses the existing nudge card, now parameterized with a message.
- Gates per commit: `npm run typecheck && npm test && npm run build` (121 baseline).
- Branch `feat/reminders`. Commit messages exact. Version bump 0.2.2 in the final task.

## File Structure

```
src/shared/types.ts          — + remindersEnabled, taskReminderMinutes
src/shared/reminders.ts      — NEW: dueReminders (pure, TDD)
src/main/reminderWatcher.ts  — NEW: ReminderWatcher (poll + dedup + fire)
src/main/index.ts            — construct + start watcher; reminder:show already broadcast by watcher via injected fn
src/preload/index.ts         — onReminder subscribe
src/renderer/src/global.d.ts
src/renderer/src/App.tsx      — onReminder → nudge card with message; onIdleDing reuses same card
src/renderer/src/components/SettingsPanel.tsx — reminders toggle + lead-time field
tests/reminders.test.ts       — NEW
```

---

### Task 1: Pure reminder logic (TDD)

**Files:** `src/shared/types.ts`, `src/shared/reminders.ts` (new), `tests/reminders.test.ts` (new)

**Interfaces:**
- types.ts: `remindersEnabled: boolean` + `taskReminderMinutes: number` on Settings; defaults `true`, `10`.
- reminders.ts:
```ts
export interface DueReminder {
  key: string // stable per occurrence, e.g. "event:<id>:<yyyy-mm-dd>" / "task:<id>:<yyyy-mm-dd>"
  title: string
  body: string
}
export interface ReminderOptions {
  leaveByBufferMinutes: number
  taskReminderMinutes: number
  windowMs: number // the poll window; a reminder is "due" when fireAt in (now-windowMs, now]
}
export function dueReminders(
  tasks: Task[],
  events: CalendarEvent[],
  now: Date,
  opts: ReminderOptions
): DueReminder[]
```
  Semantics: for each qualifying event, `fireAt = eventStart - leaveByBufferMinutes*60000`; it is DUE when `now - windowMs < fireAt <= now` AND `eventStart > now` (don't remind about something already started). For each qualifying task, `fireAt = dueDateTime - taskReminderMinutes*60000`, DUE when `now - windowMs < fireAt <= now` AND `dueDateTime > now`. Copy:
  - event → title `Coming up: <title>`, body `starts at <h:mm> — a good moment to get ready. 🍃`
  - task → title `<title>`, body `due at <h:mm> — whenever you’re ready. 🍃`
  Key date component = local date of the target time.

- [ ] Write failing tests `tests/reminders.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Task } from '../src/shared/types'
import { dueReminders } from '../src/shared/reminders'

const OPTS = { leaveByBufferMinutes: 25, taskReminderMinutes: 10, windowMs: 60_000 }
const NOW = new Date(2026, 6, 13, 14, 0, 0) // Mon Jul 13, 2:00:00 pm

function task(o: Partial<Task> & { id: string }): Task {
  return { title: o.id, importance: 'medium', source: 'local', createdAt: '2026-07-01T09:00:00', ...o }
}
function ev(o: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { title: o.id, start: '2026-07-13T14:25:00', end: '2026-07-13T15:00:00', allDay: false, ...o }
}

describe('dueReminders — events', () => {
  it('fires at start minus the leave-by buffer', () => {
    // event at 14:25, buffer 25 → fireAt 14:00 → due exactly at NOW
    const r = dueReminders([], [ev({ id: 'e1', title: 'Dentist', start: '2026-07-13T14:25:00', end: '2026-07-13T15:00:00' })], NOW, OPTS)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ key: 'event:e1:2026-07-13' })
    expect(r[0].title).toBe('Coming up: Dentist')
    expect(r[0].body).toMatch(/^starts at 2:25/)
  })
  it('does not fire when fireAt is older than the window', () => {
    // event at 14:20 → fireAt 13:55 → 5 min before NOW, window only 60s
    expect(dueReminders([], [ev({ id: 'e', start: '2026-07-13T14:20:00', end: '2026-07-13T15:00:00' })], NOW, OPTS)).toHaveLength(0)
  })
  it('does not fire once the event has started', () => {
    // buffer large enough that fireAt is in-window but start already passed
    const started = ev({ id: 'e', start: '2026-07-13T13:55:00', end: '2026-07-13T14:30:00' })
    expect(dueReminders([], [started], new Date(2026, 6, 13, 14, 0), { ...OPTS, leaveByBufferMinutes: 5 })).toHaveLength(0)
  })
  it('ignores all-day events', () => {
    expect(dueReminders([], [ev({ id: 'e', start: '2026-07-13', end: '2026-07-14', allDay: true })], NOW, OPTS)).toHaveLength(0)
  })
})

describe('dueReminders — tasks', () => {
  it('fires taskReminderMinutes before a timed task', () => {
    // task due 14:10, lead 10 → fireAt 14:00 → due at NOW
    const r = dueReminders([task({ id: 't1', title: 'Call mum', dueDate: '2026-07-13', dueTime: '14:10' })], [], NOW, OPTS)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ key: 'task:t1:2026-07-13', title: 'Call mum' })
    expect(r[0].body).toMatch(/^due at 2:10/)
  })
  it('ignores tasks without a time, completed, or snoozed', () => {
    const tasks = [
      task({ id: 'noTime', dueDate: '2026-07-13' }),
      task({ id: 'done', dueDate: '2026-07-13', dueTime: '14:10', completedAt: '2026-07-13T09:00:00' }),
      task({ id: 'snoozed', dueDate: '2026-07-13', dueTime: '14:10', snoozedUntil: '2026-07-14T00:00:00' })
    ]
    expect(dueReminders(tasks, [], NOW, OPTS)).toHaveLength(0)
  })
  it('does not fire after the due time has passed', () => {
    const past = task({ id: 't', dueDate: '2026-07-13', dueTime: '13:59' })
    expect(dueReminders([past], [], NOW, OPTS)).toHaveLength(0)
  })
  it('a malformed time never throws and never fires', () => {
    const bad = task({ id: 't', dueDate: '2026-07-13', dueTime: 'nonsense' })
    expect(dueReminders([bad], [], NOW, OPTS)).toEqual([])
  })
})
```

- [ ] RED → implement (parse event start via `new Date(start)`; task due via `new Date(dueDate + 'T' + dueTime + ':00')`; NaN-guard both → skip; format times with `toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})`; key date via local getFullYear/Month/Date of the target) → GREEN → gates (expect ~130) → commit `feat: reminder timing logic`

---

### Task 2: ReminderWatcher + settings + wiring

**Files:** `src/main/reminderWatcher.ts` (new), `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`, `src/renderer/src/components/SettingsPanel.tsx`

- `reminderWatcher.ts`:
```ts
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
    // keep the fired set from growing forever: prune keys older than today
    if (this.fired.size > 500) this.fired.clear()
  }
}
```
- index.ts: construct after the idle watcher — `const reminderWatcher = new ReminderWatcher(store, (r) => broadcast('reminder:show', r), focusOllibeu); reminderWatcher.start()`.
- preload: `onReminder: subscribe<{ title: string; body: string }>('reminder:show')`; global.d.ts mirror.
- SettingsPanel: after the idle-ding rows, add a "Reminders" checkbox → `remindersEnabled`, and when enabled a number field "remind me this many minutes before a timed task" → `taskReminderMinutes` (clamp 1..120 on blur, same pattern as the idle threshold).
- Gates → commit `feat: reminder watcher, settings, and banner wiring`

---

### Task 3: In-app reminder nudge

**Files:** `src/renderer/src/App.tsx`, `src/renderer/src/theme.css` (only if needed)

- App already has the floating nudge card for idle. Generalize: replace the boolean `nudgeVisible` with a `nudge: { message: string } | null` state (or keep a message string). The idle handler sets the message to the existing "Still with me? …" copy; the new `onReminder` handler sets the message to `r.body` (optionally prefixed by title for tasks — use ``${r.title} — ${r.body}`` when title isn't already in body; simplest: show `r.title` bold + `r.body`, but a single line is fine: for reminders show ``${r.title}: ${r.body}``). Both share the same 15s auto-dismiss + click-to-dismiss + timer.
- Wire `const offReminder = window.ollibeu.onReminder((r) => showNudge(`${r.title} — ${r.body}`))` into the consolidated effect + cleanup.
- Keep the idle path working (`showNudge('Still with me? No rush — just checking in. 🍃')`).
- Gates → commit `feat: show reminders in the on-screen nudge too`

---

### Task 4: Final review → merge → v0.2.2

- Whole-branch review; fix wave; merge; `npm version 0.2.2`; tag `v0.2.2`; watch build; verify assets.
