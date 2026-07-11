# Ollibeu Phase 2b: Calendar/Tasks Sync + Live Today Rail

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Google Calendar events (today + tomorrow) flow into a live Today rail with "leave by" nudges and a tomorrow peek; Google Tasks sync two-way (their tasks appear in the list; completing in Ollibeu completes in Google). Background sync every 5 minutes + on resume, fully offline-tolerant.

**Architecture:** All sync lives in main. Pure, tested logic (`src/shared/gcal.ts` mapping + leave-by; `src/shared/gtasksMerge.ts` two-way merge) is orchestrated by `src/main/google/api.ts` (REST client with injected fetch, tested) and `src/main/google/sync.ts` (scheduler, writes through DataStore.mutate — the single writer). The renderer just renders `data.calendar` and the merged task list it already knows how to show.

**Tech Stack:** unchanged; REST via global fetch. Endpoints: `https://www.googleapis.com/calendar/v3/calendars/primary/events`, `https://tasks.googleapis.com/tasks/v1/users/@me/lists`, `.../lists/{listId}/tasks`, PATCH `.../lists/{listId}/tasks/{taskId}`.

## Global Constraints

- No-guilt copy rule (no "overdue"/"late"/"failed"/"behind" in UI strings).
- Sync failures are quiet: cached data keeps rendering, `lastSyncedAt` just gets stale; a needs_reconnect from the API flips the rail to the gentle reconnect card. Never a blocking error state.
- External data is normalized at the sync boundary: gtask `due` (RFC3339) → `dueDate` "YYYY-MM-DD" via slice + validity check (calendar-invalid or unparseable → no dueDate). Google Tasks drops time-of-day, so no dueTime from sync.
- Local-source tasks are NEVER modified or removed by sync. gtasks-source rows mirror Google (title/due follow Google; completed in Google → completedAt set; gone from Google → row removed) EXCEPT: a locally-completed gtasks row pending upload is never resurrected or dropped by an incoming snapshot until its PATCH succeeds.
- The pinned task (`appState.activeTaskId`) must survive sync merges (only cleared if its task disappears).
- Backward compatible data file: `calendar` is a new OPTIONAL key on `OllibeuData`; loading an old file without it must work (storage merge defaults it).
- All gates before each commit: `npm run typecheck && npm test && npm run build` (60 tests baseline).
- Branch: `feat/phase2b-sync-rail` from main. Commit messages exactly as given.

## File Structure

```
src/shared/types.ts          — + CalendarEvent, CalendarCache, OllibeuData.calendar?, Task.gtasksSyncPending?
src/shared/gcal.ts           — NEW: mapGoogleEvent, eventsForDay, leaveByLabel, tomorrowPeek (pure)
src/shared/gtasksMerge.ts    — NEW: mapGtaskDue, mergeGtasks (pure two-way merge)
src/main/google/api.ts       — NEW: GoogleApi (injected fetch + token getter): listEvents, listTaskLists, listTasks, patchTaskCompleted
src/main/google/auth.ts      — 2b-entry hardening (small)
src/main/google/sync.ts      — NEW: SyncEngine (scheduler; orchestrates api + merge + DataStore)
src/main/index.ts            — wire SyncEngine (on connect, timer, resume) + sync:now IPC
src/preload/index.ts         — + syncNow(), onSyncInfo? (no — sync info rides in data.calendar.lastSyncedAt)
src/renderer/src/components/TodayRail.tsx — live events, leave-by, tomorrow peek, last-synced, reconnect
src/renderer/src/theme.css   — rail timeline styles
tests/gcal.test.ts           — NEW
tests/gtasksMerge.test.ts    — NEW
tests/googleApi.test.ts      — NEW
```

---

### Task 1: 2b-entry hardening in GoogleAuth

**Files:**
- Modify: `src/main/google/auth.ts`

**Interfaces:** unchanged public API. Five ledger items, all small:

- [ ] **Step 1:** In `disconnect()`, add `this.needsReconnect = false` right after `this.cancelRequested = true`.
- [ ] **Step 2:** In the `server.listen` callback (before `shell.openExternal`), bail out if a cancel already arrived:

```ts
        if (this.cancelRequested) {
          clearTimeout(timer)
          server.close()
          settle(() => reject(new Error('cancelled')))
          return
        }
```

- [ ] **Step 3:** In `connect()`'s `if (this.cancelRequested) throw new Error('cancelled')` branch (post-exchange), fire a best-effort revoke of the fresh grant first:

```ts
      if (this.cancelRequested) {
        if (t.refresh_token) {
          void fetch(
            `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(t.refresh_token)}`,
            { method: 'POST' }
          ).catch(() => undefined)
        }
        throw new Error('cancelled')
      }
```

- [ ] **Step 4:** Loopback resilience: in the request handler, a `/callback` request whose `state` does NOT match and carries no `error` param is ignored (keep listening) instead of settling the flow:

```ts
        const err = url.searchParams.get('error')
        const code = url.searchParams.get('code')
        const gotState = url.searchParams.get('state')
        if (!err && gotState !== state) {
          // stray/garbage request: not our flow — ignore and keep waiting
          res.writeHead(404).end()
          return
        }
```

(then the existing ok/landing logic runs only for state-matching or explicit-error callbacks; the separate `state mismatch` reject path disappears — matching requests are by definition `gotState === state`.)

- [ ] **Step 5:** Serialize `persistTokens` through a queue field (same pattern as DataStore):

```ts
  private persistQueue: Promise<void> = Promise.resolve()
```

and wrap the body: `this.persistQueue = this.persistQueue.catch(() => undefined).then(() => this.doPersistTokens()); return this.persistQueue` (rename the current body to `private async doPersistTokens()`).

- [ ] **Step 6:** On Linux, log the safeStorage backend once at create: `if (process.platform === 'linux') console.warn('[ollibeu] safeStorage backend:', safeStorage.getSelectedStorageBackend())`.
- [ ] **Step 7:** Gates (60 tests stay green), then:

```bash
git add src/main/google/auth.ts
git commit -m "fix: 2b-entry auth hardening from Phase 2a follow-up ledger"
```

---

### Task 2: Types + calendar pure logic (TDD)

**Files:**
- Modify: `src/shared/types.ts`
- Create: `src/shared/gcal.ts`, `tests/gcal.test.ts`

**Interfaces:**
- `types.ts` additions:

```ts
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
```

  plus `calendar?: CalendarCache` on `OllibeuData` and `gtasksSyncPending?: boolean` on `Task`.
- `gcal.ts` produces:
  - `mapGoogleEvent(raw: unknown): CalendarEvent | null` — accepts Google's event resource (`{ id, summary, start: { dateTime? , date? }, end: {...}, status }`); returns null for cancelled/malformed entries.
  - `eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[]` — events overlapping that local calendar day, sorted by start (all-day first).
  - `leaveByLabel(event: CalendarEvent, bufferMinutes: number, now: Date): string | null` — for a timed event later today: `"leave by 3:35 PM"` (start − buffer, locale-formatted); null for all-day/past/other days.
  - `tomorrowPeek(events: CalendarEvent[], now: Date): string` — `"Tomorrow: nothing on the calendar 😌"` / `"Tomorrow: quiet until 10:00 AM 😌"` / `"Tomorrow: N things, first at 9:00 AM"`.

- [ ] **Step 1: Write failing tests `tests/gcal.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../src/shared/types'
import { eventsForDay, leaveByLabel, mapGoogleEvent, tomorrowPeek } from '../src/shared/gcal'

const NOW = new Date(2026, 6, 10, 14, 0) // Fri Jul 10, 2:00 pm

function ev(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { title: overrides.id, start: '2026-07-10T16:00:00', end: '2026-07-10T17:00:00', allDay: false, ...overrides }
}

describe('mapGoogleEvent', () => {
  it('maps a timed event', () => {
    const e = mapGoogleEvent({
      id: 'x1',
      summary: 'Dentist',
      status: 'confirmed',
      start: { dateTime: '2026-07-10T16:00:00-04:00' },
      end: { dateTime: '2026-07-10T17:00:00-04:00' }
    })
    expect(e).toMatchObject({ id: 'x1', title: 'Dentist', allDay: false })
  })
  it('maps an all-day event', () => {
    const e = mapGoogleEvent({
      id: 'x2',
      summary: 'Trip',
      status: 'confirmed',
      start: { date: '2026-07-11' },
      end: { date: '2026-07-12' }
    })
    expect(e).toMatchObject({ id: 'x2', allDay: true, start: '2026-07-11' })
  })
  it('drops cancelled and malformed entries', () => {
    expect(mapGoogleEvent({ id: 'x', status: 'cancelled', start: { date: '2026-07-11' }, end: { date: '2026-07-12' } })).toBeNull()
    expect(mapGoogleEvent({ summary: 'no id' })).toBeNull()
    expect(mapGoogleEvent(null)).toBeNull()
  })
  it('untitled events get gentle placeholder', () => {
    const e = mapGoogleEvent({ id: 'x3', status: 'confirmed', start: { dateTime: '2026-07-10T16:00:00' }, end: { dateTime: '2026-07-10T17:00:00' } })
    expect(e?.title).toBe('(something on the calendar)')
  })
})

describe('eventsForDay', () => {
  it('returns events overlapping the day, all-day first, sorted by start', () => {
    const events = [
      ev({ id: 'b', start: '2026-07-10T16:00:00', end: '2026-07-10T17:00:00' }),
      ev({ id: 'a', start: '2026-07-10T09:00:00', end: '2026-07-10T10:00:00' }),
      ev({ id: 'allday', start: '2026-07-10', end: '2026-07-11', allDay: true }),
      ev({ id: 'other-day', start: '2026-07-12T09:00:00', end: '2026-07-12T10:00:00' })
    ]
    expect(eventsForDay(events, NOW).map((e) => e.id)).toEqual(['allday', 'a', 'b'])
  })
})

describe('leaveByLabel', () => {
  it('labels an upcoming timed event today', () => {
    expect(leaveByLabel(ev({ id: 'x' }), 25, NOW)).toMatch(/^leave by 3:35/)
  })
  it('returns null for past events, all-day events, and other days', () => {
    expect(leaveByLabel(ev({ id: 'p', start: '2026-07-10T09:00:00', end: '2026-07-10T10:00:00' }), 25, NOW)).toBeNull()
    expect(leaveByLabel(ev({ id: 'a', start: '2026-07-10', end: '2026-07-11', allDay: true }), 25, NOW)).toBeNull()
    expect(leaveByLabel(ev({ id: 't', start: '2026-07-11T09:00:00', end: '2026-07-11T10:00:00' }), 25, NOW)).toBeNull()
  })
})

describe('tomorrowPeek', () => {
  it('celebrates an empty tomorrow', () => {
    expect(tomorrowPeek([], NOW)).toBe('Tomorrow: nothing on the calendar 😌')
  })
  it('mentions the first timed event', () => {
    const events = [ev({ id: 't', start: '2026-07-11T10:00:00', end: '2026-07-11T11:00:00' })]
    expect(tomorrowPeek(events, NOW)).toMatch(/^Tomorrow: quiet until 10:00/)
  })
  it('counts multiple events', () => {
    const events = [
      ev({ id: 't1', start: '2026-07-11T09:00:00', end: '2026-07-11T10:00:00' }),
      ev({ id: 't2', start: '2026-07-11T13:00:00', end: '2026-07-11T14:00:00' })
    ]
    expect(tomorrowPeek(events, NOW)).toMatch(/^Tomorrow: 2 things, first at 9:00/)
  })
})
```

- [ ] **Step 2: RED** — `npx vitest run tests/gcal.test.ts` fails (module missing).
- [ ] **Step 3: Implement `src/shared/gcal.ts`**

```ts
import type { CalendarEvent } from './types'

interface RawTime {
  dateTime?: unknown
  date?: unknown
}

export function mapGoogleEvent(raw: unknown): CalendarEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as { id?: unknown; summary?: unknown; status?: unknown; start?: RawTime; end?: RawTime }
  if (typeof r.id !== 'string' || r.status === 'cancelled') return null
  const start = timeOf(r.start)
  const end = timeOf(r.end)
  if (!start || !end) return null
  return {
    id: r.id,
    title: typeof r.summary === 'string' && r.summary ? r.summary : '(something on the calendar)',
    start: start.value,
    end: end.value,
    allDay: start.allDay
  }
}

function timeOf(t: RawTime | undefined): { value: string; allDay: boolean } | null {
  if (!t) return null
  if (typeof t.dateTime === 'string' && !Number.isNaN(new Date(t.dateTime).getTime())) {
    return { value: t.dateTime, allDay: false }
  }
  if (typeof t.date === 'string' && !Number.isNaN(new Date(t.date + 'T00:00:00').getTime())) {
    return { value: t.date, allDay: true }
  }
  return null
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function eventStart(e: CalendarEvent): Date {
  return e.allDay ? new Date(e.start + 'T00:00:00') : new Date(e.start)
}

function eventEnd(e: CalendarEvent): Date {
  // all-day end dates are exclusive in Google's model
  return e.allDay ? new Date(e.end + 'T00:00:00') : new Date(e.end)
}

export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  return events
    .filter((e) => eventStart(e) < dayEnd && eventEnd(e) > dayStart)
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return eventStart(a).getTime() - eventStart(b).getTime() || a.id.localeCompare(b.id)
    })
}

export function leaveByLabel(event: CalendarEvent, bufferMinutes: number, now: Date): string | null {
  if (event.allDay) return null
  const start = eventStart(event)
  if (Number.isNaN(start.getTime())) return null
  if (startOfDay(start).getTime() !== startOfDay(now).getTime()) return null
  if (start <= now) return null
  const leaveAt = new Date(start.getTime() - bufferMinutes * 60_000)
  return `leave by ${leaveAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function tomorrowPeek(events: CalendarEvent[], now: Date): string {
  const tomorrow = new Date(startOfDay(now).getTime() + 86_400_000)
  const list = eventsForDay(events, tomorrow)
  if (list.length === 0) return 'Tomorrow: nothing on the calendar 😌'
  const firstTimed = list.find((e) => !e.allDay)
  const firstAt = firstTimed
    ? eventStart(firstTimed).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null
  if (list.length === 1 && firstAt) return `Tomorrow: quiet until ${firstAt} 😌`
  if (firstAt) return `Tomorrow: ${list.length} things, first at ${firstAt}`
  return `Tomorrow: ${list.length} ${list.length === 1 ? 'thing' : 'things'} on the calendar`
}
```

- [ ] **Step 4:** Add the types.ts additions (exact interfaces above; `calendar?: CalendarCache`, `gtasksSyncPending?: boolean`).
- [ ] **Step 5: GREEN + full gates** (60 + 11 = 71 tests).
- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/gcal.ts tests/gcal.test.ts
git commit -m "feat: calendar event mapping, day filtering, leave-by and tomorrow-peek logic"
```

---

### Task 3: Google Tasks merge logic (TDD)

**Files:**
- Create: `src/shared/gtasksMerge.ts`, `tests/gtasksMerge.test.ts`

**Interfaces:**
- `RemoteGtask = { id: string; listId: string; title: string; due?: string; completed: boolean }` (the api layer produces this)
- `mapGtaskDue(due: unknown): string | undefined` — RFC3339 → valid "YYYY-MM-DD" or undefined.
- `mergeGtasks(local: Task[], remote: RemoteGtask[], nowIso: string): { tasks: Task[]; toComplete: { listId: string; taskId: string }[] }`
  Rules:
  - local-source tasks pass through untouched
  - remote task not yet local → new Task (source 'gtasks', importance 'medium', createdAt nowIso, title/dueDate from remote)
  - remote + local (matched by gtasksId): title/dueDate follow remote; completed remotely → completedAt kept-or-set (nowIso if newly completed)
  - local gtasks row completed locally with `gtasksSyncPending` → keep as-is; emit `{listId, taskId}` in `toComplete`
  - local gtasks row absent from remote: remove — UNLESS `gtasksSyncPending` (it may simply be filtered as completed remotely later; keep until upload resolves)

- [ ] **Step 1: Write failing tests `tests/gtasksMerge.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { mapGtaskDue, mergeGtasks, type RemoteGtask } from '../src/shared/gtasksMerge'

const NOW = '2026-07-10T14:00:00.000Z'

function local(overrides: Partial<Task> & { id: string }): Task {
  return { title: overrides.id, importance: 'medium', source: 'local', createdAt: '2026-07-01T09:00:00', ...overrides }
}

function gtaskRow(overrides: Partial<Task> & { id: string; gtasksId: string }): Task {
  return { ...local(overrides), source: 'gtasks', gtasksListId: 'L1', ...overrides }
}

function remote(overrides: Partial<RemoteGtask> & { id: string }): RemoteGtask {
  return { listId: 'L1', title: overrides.id, completed: false, ...overrides }
}

describe('mapGtaskDue', () => {
  it('normalizes RFC3339 to a plain date', () => {
    expect(mapGtaskDue('2026-07-15T00:00:00.000Z')).toBe('2026-07-15')
  })
  it('rejects garbage and calendar-invalid dates', () => {
    expect(mapGtaskDue('not-a-date')).toBeUndefined()
    expect(mapGtaskDue('2026-02-30T00:00:00.000Z')).toBeUndefined()
    expect(mapGtaskDue(undefined)).toBeUndefined()
    expect(mapGtaskDue(42)).toBeUndefined()
  })
})

describe('mergeGtasks', () => {
  it('leaves local-source tasks untouched', () => {
    const mine = local({ id: 'mine', importance: 'high' })
    const { tasks } = mergeGtasks([mine], [], NOW)
    expect(tasks).toEqual([mine])
  })

  it('imports new remote tasks', () => {
    const { tasks } = mergeGtasks([], [remote({ id: 'g1', title: 'Buy milk', due: '2026-07-15T00:00:00.000Z' })], NOW)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      source: 'gtasks',
      gtasksId: 'g1',
      gtasksListId: 'L1',
      title: 'Buy milk',
      dueDate: '2026-07-15',
      importance: 'medium'
    })
  })

  it('follows remote title/due changes and remote completion', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', title: 'Old', dueDate: '2026-07-14' })
    const { tasks } = mergeGtasks([row], [remote({ id: 'g1', title: 'New', due: '2026-07-16T00:00:00.000Z', completed: true })], NOW)
    expect(tasks[0]).toMatchObject({ id: 't1', title: 'New', dueDate: '2026-07-16', completedAt: NOW })
  })

  it('does not overwrite an existing completedAt on repeat syncs', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', completedAt: '2026-07-09T08:00:00' })
    const { tasks } = mergeGtasks([row], [remote({ id: 'g1', completed: true })], NOW)
    expect(tasks[0].completedAt).toBe('2026-07-09T08:00:00')
  })

  it('queues locally-completed pending rows for upload and keeps them', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', completedAt: NOW, gtasksSyncPending: true })
    const { tasks, toComplete } = mergeGtasks([row], [remote({ id: 'g1' })], NOW)
    expect(toComplete).toEqual([{ listId: 'L1', taskId: 'g1' }])
    expect(tasks[0]).toMatchObject({ id: 't1', gtasksSyncPending: true, completedAt: NOW })
  })

  it('removes gtasks rows that vanished remotely, unless upload-pending', () => {
    const gone = gtaskRow({ id: 't1', gtasksId: 'g1' })
    const pending = gtaskRow({ id: 't2', gtasksId: 'g2', completedAt: NOW, gtasksSyncPending: true })
    const { tasks } = mergeGtasks([gone, pending], [], NOW)
    expect(tasks.map((t) => t.id)).toEqual(['t2'])
  })
})
```

- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement `src/shared/gtasksMerge.ts`**

```ts
import type { Task } from './types'

export interface RemoteGtask {
  id: string
  listId: string
  title: string
  due?: string
  completed: boolean
}

export function mapGtaskDue(due: unknown): string | undefined {
  if (typeof due !== 'string') return undefined
  const day = due.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined
  const parsed = new Date(day + 'T00:00:00')
  if (Number.isNaN(parsed.getTime())) return undefined
  // reject calendar-invalid dates that Date silently rolls forward (e.g. Feb 30)
  const roundTrip = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  return roundTrip === day ? day : undefined
}

export function mergeGtasks(
  local: Task[],
  remote: RemoteGtask[],
  nowIso: string
): { tasks: Task[]; toComplete: { listId: string; taskId: string }[] } {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const toComplete: { listId: string; taskId: string }[] = []
  const tasks: Task[] = []

  for (const t of local) {
    if (t.source !== 'gtasks' || !t.gtasksId) {
      tasks.push(t)
      continue
    }
    if (t.gtasksSyncPending && t.completedAt) {
      toComplete.push({ listId: t.gtasksListId ?? '', taskId: t.gtasksId })
      tasks.push(t)
      remoteById.delete(t.gtasksId)
      continue
    }
    const r = remoteById.get(t.gtasksId)
    if (!r) continue // vanished remotely — drop the mirror row
    remoteById.delete(t.gtasksId)
    tasks.push({
      ...t,
      title: r.title || t.title,
      dueDate: mapGtaskDue(r.due),
      completedAt: r.completed ? (t.completedAt ?? nowIso) : t.completedAt
    })
  }

  for (const r of remoteById.values()) {
    tasks.push({
      id: `gtasks:${r.listId}:${r.id}`,
      title: r.title || '(untitled)',
      importance: 'medium',
      source: 'gtasks',
      gtasksId: r.id,
      gtasksListId: r.listId,
      ...(mapGtaskDue(r.due) ? { dueDate: mapGtaskDue(r.due) } : {}),
      createdAt: nowIso,
      ...(r.completed ? { completedAt: nowIso } : {})
    })
  }

  return { tasks, toComplete }
}
```

- [ ] **Step 4: GREEN + gates** (71 + 8 = 79 tests).
- [ ] **Step 5: Commit**

```bash
git add src/shared/gtasksMerge.ts tests/gtasksMerge.test.ts
git commit -m "feat: two-way Google Tasks merge with pending-upload protection"
```

---

### Task 4: Google API client (TDD, injected fetch)

**Files:**
- Create: `src/main/google/api.ts`, `tests/googleApi.test.ts`

**Interfaces:**
- `type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>`
- `class GoogleApi { constructor(getToken: () => Promise<string>, fetchImpl?: FetchLike) }` with:
  - `listEvents(timeMinIso: string, timeMaxIso: string): Promise<CalendarEvent[]>` — primary calendar, `singleEvents=true&orderBy=startTime&maxResults=100`, maps via `mapGoogleEvent`, drops nulls; follows `nextPageToken` (max 3 pages).
  - `listAllTasks(): Promise<RemoteGtask[]>` — all task lists (`maxResults=50`), then per list `showCompleted=true&showHidden=true&maxResults=100`; maps `{id, title, due, status}` → RemoteGtask (completed = status === 'completed'); skips items without id.
  - `patchTaskCompleted(listId: string, taskId: string): Promise<void>` — PATCH `{ status: 'completed' }`.
  - All requests: `Authorization: Bearer <token>`; non-ok → throw `new Error('google-api:' + status)` (401 included — the token getter already refreshes; a 401 after refresh means needs_reconnect upstream).

- [ ] **Step 1: Write failing tests `tests/googleApi.test.ts`** — use a stub fetch capturing URLs/init and returning canned pages:

```ts
import { describe, expect, it } from 'vitest'
import { GoogleApi } from '../src/main/google/api'

function stubFetch(routes: Record<string, unknown | ((url: string, init?: unknown) => unknown)>) {
  const calls: { url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }[] = []
  const impl = async (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => {
    calls.push({ url, init })
    const key = Object.keys(routes).find((k) => url.includes(k))
    if (!key) return { ok: false, status: 404, json: async () => ({}), text: async () => 'not found' }
    const val = routes[key]
    const body = typeof val === 'function' ? (val as (u: string, i?: unknown) => unknown)(url, init) : val
    return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }
  }
  return { impl, calls }
}

const token = async (): Promise<string> => 'tok-123'

describe('GoogleApi', () => {
  it('lists events with auth header and query params, mapping and dropping junk', async () => {
    const { impl, calls } = stubFetch({
      '/calendars/primary/events': {
        items: [
          { id: 'e1', summary: 'Dentist', status: 'confirmed', start: { dateTime: '2026-07-10T16:00:00' }, end: { dateTime: '2026-07-10T17:00:00' } },
          { id: 'gone', status: 'cancelled', start: { date: '2026-07-10' }, end: { date: '2026-07-11' } },
          { junk: true }
        ]
      }
    })
    const api = new GoogleApi(token, impl)
    const events = await api.listEvents('2026-07-10T00:00:00Z', '2026-07-12T00:00:00Z')
    expect(events.map((e) => e.id)).toEqual(['e1'])
    expect(calls[0].init?.headers?.Authorization).toBe('Bearer tok-123')
    expect(calls[0].url).toContain('singleEvents=true')
    expect(calls[0].url).toContain('timeMin=')
  })

  it('follows nextPageToken up to a bounded number of pages', async () => {
    let page = 0
    const { impl, calls } = stubFetch({
      '/calendars/primary/events': () => {
        page += 1
        return page < 5
          ? { items: [{ id: `e${page}`, status: 'confirmed', start: { dateTime: '2026-07-10T10:00:00' }, end: { dateTime: '2026-07-10T11:00:00' } }], nextPageToken: 'next' }
          : { items: [] }
      }
    })
    const api = new GoogleApi(token, impl)
    const events = await api.listEvents('a', 'b')
    expect(events.length).toBeLessThanOrEqual(3)
    expect(calls.length).toBeLessThanOrEqual(3)
  })

  it('aggregates tasks across lists', async () => {
    const { impl } = stubFetch({
      '/users/@me/lists': { items: [{ id: 'L1' }, { id: 'L2' }] },
      '/lists/L1/tasks': { items: [{ id: 'g1', title: 'One', status: 'needsAction' }] },
      '/lists/L2/tasks': { items: [{ id: 'g2', title: 'Two', status: 'completed', due: '2026-07-15T00:00:00.000Z' }, { title: 'no id' }] }
    })
    const api = new GoogleApi(token, impl)
    const tasks = await api.listAllTasks()
    expect(tasks).toEqual([
      { id: 'g1', listId: 'L1', title: 'One', due: undefined, completed: false },
      { id: 'g2', listId: 'L2', title: 'Two', due: '2026-07-15T00:00:00.000Z', completed: true }
    ])
  })

  it('patches completion and throws a status error on failure', async () => {
    const { impl, calls } = stubFetch({ '/lists/L1/tasks/g1': {} })
    const api = new GoogleApi(token, impl)
    await api.patchTaskCompleted('L1', 'g1')
    expect(calls[0].init?.method).toBe('PATCH')
    expect(calls[0].init?.body).toContain('completed')

    const bad = new GoogleApi(token, async () => ({ ok: false, status: 403, json: async () => ({}), text: async () => 'nope' }))
    await expect(bad.patchTaskCompleted('L1', 'g1')).rejects.toThrow('google-api:403')
  })
})
```

- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement `src/main/google/api.ts`**

```ts
import type { CalendarEvent } from '../../shared/types'
import { mapGoogleEvent } from '../../shared/gcal'
import type { RemoteGtask } from '../../shared/gtasksMerge'

export type FetchLike = (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string }
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown>; text(): Promise<string> }>

const CAL = 'https://www.googleapis.com/calendar/v3'
const TASKS = 'https://tasks.googleapis.com/tasks/v1'
const MAX_PAGES = 3

export class GoogleApi {
  constructor(
    private readonly getToken: () => Promise<string>,
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike
  ) {}

  private async request(url: string, init?: { method?: string; body?: string }): Promise<unknown> {
    const tokenValue = await this.getToken()
    const res = await this.fetchImpl(url, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${tokenValue}`,
        ...(init?.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(init?.body ? { body: init.body } : {})
    })
    if (!res.ok) throw new Error(`google-api:${res.status}`)
    return res.json()
  }

  async listEvents(timeMinIso: string, timeMaxIso: string): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = []
    let pageToken: string | undefined
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const params = new URLSearchParams({
        singleEvents: 'true',
        orderBy: 'startTime',
        maxResults: '100',
        timeMin: timeMinIso,
        timeMax: timeMaxIso,
        ...(pageToken ? { pageToken } : {})
      })
      const body = (await this.request(`${CAL}/calendars/primary/events?${params}`)) as {
        items?: unknown[]
        nextPageToken?: string
      }
      for (const item of body.items ?? []) {
        const mapped = mapGoogleEvent(item)
        if (mapped) events.push(mapped)
      }
      pageToken = body.nextPageToken
      if (!pageToken) break
    }
    return events
  }

  async listAllTasks(): Promise<RemoteGtask[]> {
    const listsBody = (await this.request(`${TASKS}/users/@me/lists?maxResults=50`)) as {
      items?: { id?: unknown }[]
    }
    const out: RemoteGtask[] = []
    for (const list of listsBody.items ?? []) {
      if (typeof list.id !== 'string') continue
      const body = (await this.request(
        `${TASKS}/lists/${encodeURIComponent(list.id)}/tasks?showCompleted=true&showHidden=true&maxResults=100`
      )) as { items?: { id?: unknown; title?: unknown; due?: unknown; status?: unknown }[] }
      for (const item of body.items ?? []) {
        if (typeof item.id !== 'string') continue
        out.push({
          id: item.id,
          listId: list.id,
          title: typeof item.title === 'string' ? item.title : '',
          due: typeof item.due === 'string' ? item.due : undefined,
          completed: item.status === 'completed'
        })
      }
    }
    return out
  }

  async patchTaskCompleted(listId: string, taskId: string): Promise<void> {
    await this.request(
      `${TASKS}/lists/${encodeURIComponent(listId)}/tasks/${encodeURIComponent(taskId)}`,
      { method: 'PATCH', body: JSON.stringify({ status: 'completed' }) }
    )
  }
}
```

- [ ] **Step 4: GREEN + gates** (79 + 4 = 83 tests).
- [ ] **Step 5: Commit**

```bash
git add src/main/google/api.ts tests/googleApi.test.ts
git commit -m "feat: Google Calendar and Tasks REST client with injected fetch"
```

---

### Task 5: Sync engine + wiring

**Files:**
- Create: `src/main/google/sync.ts`
- Modify: `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`

**Interfaces:**
- `class SyncEngine { constructor(store: DataStore, auth: GoogleAuth, api?: GoogleApi); start(): void; stop(): void; syncNow(): Promise<void> }`
  - `start()`: `setInterval(syncNow, 5 * 60_000)` + `powerMonitor.on('resume', syncNow)` + immediate `syncNow()` when auth status is connected; also subscribes to `auth.onStatusChange` — a transition to connected triggers `syncNow()`.
  - `syncNow()`: no-op unless connected. Window: `timeMin` = start of today local, `timeMax` = end of tomorrow. Fetch events + tasks; merge via `mergeGtasks(store.get().tasks, remote, new Date().toISOString())`; PATCH everything in `toComplete` (per item: on success clear that task's `gtasksSyncPending`; on failure leave it pending); single `store.mutate` applying `{ tasks, calendar: { events, lastSyncedAt } }`; clear `appState.activeTaskId` if its task no longer exists. Errors: `needs_reconnect` from getAccessToken → swallow (status push already informs UI); other errors → `console.error` once, keep cache.
  - Also: completing a gtasks-source task locally must mark it pending — in `src/main/index.ts`'s `task:complete` handler, when the task has `source === 'gtasks'`, set `gtasksSyncPending: true` alongside `completedAt`, then fire-and-forget `syncEngine.syncNow()`.
- IPC: `sync:now` (invoke) → `syncEngine.syncNow()`; preload `syncNow(): Promise<void>`; global.d.ts mirror. (The rail's data — events, lastSyncedAt — arrives via the normal `data:changed` push.)

- [ ] **Step 1: Implement `src/main/google/sync.ts`**

```ts
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
```

- [ ] **Step 2: Wire in `src/main/index.ts`** (success branch, after store handlers): modify `task:complete` to add the pending flag for gtasks rows, construct + start the engine, register `sync:now`:

```ts
  ipcMain.handle('task:complete', (_e, id: string, completedAt: string) =>
    store.mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id === id
          ? { ...t, completedAt, ...(t.source === 'gtasks' ? { gtasksSyncPending: true } : {}) }
          : t
      ),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
  )
```

(replacing the existing handler), then after the google handlers:

```ts
  const syncEngine = new SyncEngine(store, google)
  ipcMain.handle('sync:now', () => syncEngine.syncNow())
  syncEngine.start()
```

and in the same file, after a gtasks completion the engine should push promptly — extend the `task:complete` handler body's return: chain `.then(() => void syncEngine.syncNow())` is NOT possible before syncEngine exists; instead register the handler AFTER creating syncEngine and write:

```ts
  ipcMain.removeHandler('task:complete')
  ipcMain.handle('task:complete', async (_e, id: string, completedAt: string) => {
    let wasGtasks = false
    await store.mutate((d) => ({
      ...d,
      tasks: d.tasks.map((t) => {
        if (t.id !== id) return t
        if (t.source === 'gtasks') wasGtasks = true
        return { ...t, completedAt, ...(t.source === 'gtasks' ? { gtasksSyncPending: true } : {}) }
      }),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
    if (wasGtasks) void syncEngine.syncNow()
  })
```

(keep ONE `task:complete` registration — define it once after syncEngine exists rather than re-registering; order the code accordingly.)

- [ ] **Step 3: preload + global.d.ts** — add `syncNow: (): Promise<void> => ipcRenderer.invoke('sync:now')` and mirror the type.
- [ ] **Step 4: Gates** (83 tests stay green — engine itself is exercised in 2b's manual smoke; its logic pieces are the tested pure functions and api client).
- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: background sync engine — calendar window, two-way tasks, resume and interval triggers"
```

---

### Task 6: Live Today rail

**Files:**
- Modify: `src/renderer/src/components/TodayRail.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

**Interfaces:**
- `TodayRail({ night, google, onConnect, calendar, leaveByBufferMinutes, now }: { night: boolean; google: GoogleStatus; onConnect: () => void; calendar?: CalendarCache; leaveByBufferMinutes: number; now: Date })`

- [ ] **Step 1: Replace the `connected` branch of TodayRail** with the live view (keep every other branch exactly as is):

```tsx
        <>
          <div className="rail-timeline">
            {todayEvents.length === 0 ? (
              <p className="placeholder-copy">Nothing on the calendar today 🍃</p>
            ) : (
              todayEvents.map((e) => {
                const started = !e.allDay && new Date(e.start) <= props.now
                const leaveBy = leaveByLabel(e, props.leaveByBufferMinutes, props.now)
                return (
                  <div key={e.id} className={`rail-event${started ? ' started' : ''}`}>
                    <div className="rail-time">
                      {e.allDay
                        ? 'all day'
                        : new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className="rail-event-title">{e.title}</div>
                    {leaveBy && <div className="rail-leave-by">{leaveBy}</div>}
                  </div>
                )
              })
            )}
          </div>
          <p className="rail-tomorrow">{tomorrowPeek(events, props.now)}</p>
          {props.calendar && (
            <p className="rail-synced">
              synced{' '}
              {new Date(props.calendar.lastSyncedAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
          )}
        </>
```

with, above the return:

```tsx
  const events = props.calendar?.events ?? []
  const todayEvents = eventsForDay(events, props.now)
```

and imports `import { eventsForDay, leaveByLabel, tomorrowPeek } from '@shared/gcal'`, `import type { CalendarCache, GoogleStatus } from '@shared/types'`.

- [ ] **Step 2: App.tsx** — pass the new props:

```tsx
        <TodayRail
          night={night}
          google={google}
          onConnect={() => void window.ollibeu.google.connect().catch(() => {})}
          calendar={data.calendar}
          leaveByBufferMinutes={data.settings.leaveByBufferMinutes}
          now={now}
        />
```

- [ ] **Step 3: theme.css additions**

```css
.rail-timeline { border-left: 2px solid var(--rail-border); padding-left: 10px; margin: 4px 0 10px; }
.rail-event { margin-bottom: 10px; }
.rail-event.started { opacity: 0.55; }
.rail-time { color: var(--text-faint); font-size: 10px; }
.rail-event-title { font-size: 13px; color: var(--text); }
.rail-leave-by { font-size: 10px; color: #b0846a; }
.rail-tomorrow { color: var(--text-faint); font-size: 11px; border-top: 1px solid var(--rail-border); padding-top: 8px; }
.rail-synced { color: var(--text-faint); font-size: 10px; margin-top: 6px; }
```

- [ ] **Step 4: Gates + commit + push**

```bash
git add -A
git commit -m "feat: live Today rail — events, leave-by nudges, tomorrow peek, sync hint"
git push -u origin feat/phase2b-sync-rail
```
