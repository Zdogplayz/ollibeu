# Ollibeu Follow-ups: Due Times, Real Celebration, Pinned-in-List (Phase 1.1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Three user-requested improvements after the Phase 1 smoke test: optional due date/time on tasks (shown as a calm chip, weighed by the picker), a confetti burst on completion, and pinned tasks staying visible in the list with an "up front ✨" badge.

**Architecture:** Pure logic (deadline scoring, due-label formatting) goes in `src/shared/` with Vitest TDD; UI wiring extends the existing components. No new dependencies.

**Tech Stack:** unchanged (Electron 31, React 18, TS strict, Vitest).

## Global Constraints

- No-guilt copy rule: "overdue", "late", "failed", "behind" never appear in UI strings. A past-due chip renders identically to a future one.
- Due chip and badge are calm: small, muted, never red-alert styling.
- `dueTime` is only meaningful alongside `dueDate`; both optional; adding a task with neither must stay a two-keystroke flow (type title, Enter).
- Confetti uses only existing theme CSS variables (`--edge-high`, `--edge-medium`, `--edge-low`, `--accent`); ~750ms; no library.
- All gates before each commit: `npm run typecheck && npm test && npm run build`.
- Work on branch `feat/times-celebration-pin` from `main`.

## File Structure

```
src/shared/types.ts          — + dueTime?: string ("HH:MM")
src/shared/pickOne.ts        — scoreTask uses dueTime in the deadline
src/shared/dayText.ts        — + dueLabel(dueDate, dueTime, now)
tests/pickOne.test.ts        — + dueTime scoring cases
tests/dayText.test.ts        — + dueLabel cases
src/renderer/src/components/AddTask.tsx      — optional date + time inputs
src/renderer/src/components/TaskList.tsx     — due chip, pinned badge, confetti mount
src/renderer/src/components/ConfettiBurst.tsx — new
src/renderer/src/App.tsx     — addTask signature, pinned-stays-in-list filter, 800ms window
src/renderer/src/theme.css   — .due-chip, .pinned-badge, .confetti styles
```

---

### Task 1: Shared logic — dueTime scoring + dueLabel (TDD)

**Files:**
- Modify: `src/shared/types.ts`, `src/shared/pickOne.ts`, `src/shared/dayText.ts`
- Test: `tests/pickOne.test.ts`, `tests/dayText.test.ts` (append cases)

**Interfaces:**
- Consumes: existing `Task`, `scoreTask`, `dayText` module.
- Produces: `Task.dueTime?: string` ("HH:MM" 24h); `scoreTask` deadline = `dueDate + 'T' + (dueTime ?? '23:59') + ':00'`; `dueLabel(dueDate: string, dueTime: string | undefined, now: Date): string` returning e.g. `today`, `tomorrow`, `today · 4:00 PM`, `Fri, Jul 17 · 9:00 AM` (weekday/month via `toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })`).

- [ ] **Step 1: Append failing tests**

To `tests/pickOne.test.ts` (inside the existing describe; `task()` factory and `NOW` = 2026-07-10T14:00:00 already exist):

```ts
  it('a due time already passed today outranks one later today', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-07-10', dueTime: '16:00' }),
      task({ id: 'b', dueDate: '2026-07-10', dueTime: '09:00' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('dueTime absent falls back to end-of-day deadline', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-07-10' }),
      task({ id: 'b', dueDate: '2026-07-10', dueTime: '09:00' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })
```

To `tests/dayText.test.ts` (new top-level describe; import `dueLabel` alongside the existing imports):

```ts
describe('dueLabel', () => {
  const now = new Date(2026, 6, 10, 14, 0) // Friday July 10
  it('says today / tomorrow without a time', () => {
    expect(dueLabel('2026-07-10', undefined, now)).toBe('today')
    expect(dueLabel('2026-07-11', undefined, now)).toBe('tomorrow')
  })
  it('appends a friendly time when present', () => {
    expect(dueLabel('2026-07-10', '16:00', now)).toMatch(/^today · 4:00/)
  })
  it('uses a short calendar form for other days', () => {
    expect(dueLabel('2026-07-17', undefined, now)).toMatch(/Jul/)
    expect(dueLabel('2026-07-17', undefined, now)).toMatch(/17/)
  })
  it('renders past dates with the same calm form (no guilt words)', () => {
    const label = dueLabel('2026-07-08', undefined, now)
    expect(label).toMatch(/Jul/)
    expect(label.toLowerCase()).not.toMatch(/overdue|late|behind|failed/)
  })
})
```

- [ ] **Step 2: Run to verify failures**

Run: `npx vitest run tests/pickOne.test.ts tests/dayText.test.ts`
Expected: FAIL — `dueTime` not in `Task` (type error surfaces at runtime as test failure on pick order) and `dueLabel` not exported.

- [ ] **Step 3: Implement**

`src/shared/types.ts` — after the `dueDate?` line add:

```ts
  dueTime?: string // "HH:MM" 24h, only meaningful with dueDate
```

`src/shared/pickOne.ts` — in `scoreTask`, replace the `if (task.dueDate) { ... }` block's first line computing `daysUntilDue` with:

```ts
    const deadline = new Date(task.dueDate + 'T' + (task.dueTime ?? '23:59') + ':00')
    const daysUntilDue = (deadline.getTime() - now.getTime()) / DAY_MS
```

`src/shared/dayText.ts` — append:

```ts
export function dueLabel(dueDate: string, dueTime: string | undefined, now: Date): string {
  const due = new Date(dueDate + 'T00:00:00')
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  let day: string
  if (diffDays === 0) day = 'today'
  else if (diffDays === 1) day = 'tomorrow'
  else day = due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  if (!dueTime) return day
  const [h, m] = dueTime.split(':').map(Number)
  const at = new Date(2000, 0, 1, h, m)
  return `${day} · ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/pickOne.test.ts tests/dayText.test.ts`
Expected: PASS (10 + 9 = 19 tests across the two files).

- [ ] **Step 5: Full gates + commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; 33 tests total.

```bash
git add src/shared/types.ts src/shared/pickOne.ts src/shared/dayText.ts tests/pickOne.test.ts tests/dayText.test.ts
git commit -m "feat: optional due time on tasks, time-aware picking, calm due labels"
```

---

### Task 2: AddTask date/time inputs, due chips, pinned badge

**Files:**
- Modify: `src/renderer/src/components/AddTask.tsx`, `src/renderer/src/components/TaskList.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

**Interfaces:**
- Consumes: `dueLabel` (Task 1), existing `update()`/handlers.
- Produces: `AddTask({ onAdd }: { onAdd: (title, importance, dueDate?: string, dueTime?: string) => void })`; `TaskList({ tasks, justDoneId, pinnedId, now, onComplete })`; App keeps the pinned task in `openTasks` (only an *unpinned* suggestion is excluded).

- [ ] **Step 1: Replace `AddTask.tsx` with:**

```tsx
import { useState } from 'react'
import type { Importance } from '@shared/types'

export default function AddTask(props: {
  onAdd: (title: string, importance: Importance, dueDate?: string, dueTime?: string) => void
}) {
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState<Importance>('medium')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.onAdd(trimmed, importance, dueDate || undefined, dueDate ? dueTime || undefined : undefined)
    setTitle('')
    setDueDate('')
    setDueTime('')
  }

  return (
    <form className="add-task" onSubmit={submit}>
      <input
        type="text"
        placeholder="+ add something"
        aria-label="New task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select
        aria-label="Importance"
        value={importance}
        onChange={(e) => setImportance(e.target.value as Importance)}
      >
        <option value="high">important</option>
        <option value="medium">soon-ish</option>
        <option value="low">whenever</option>
      </select>
      <input
        type="date"
        aria-label="When (optional)"
        title="when? (optional)"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
      <input
        type="time"
        aria-label="Time (optional)"
        title="what time? (optional)"
        value={dueTime}
        disabled={!dueDate}
        onChange={(e) => setDueTime(e.target.value)}
      />
      <button type="submit" className="pill-button">
        add
      </button>
    </form>
  )
}
```

- [ ] **Step 2: Replace `TaskList.tsx` with:**

```tsx
import type { Task } from '@shared/types'
import { dueLabel } from '@shared/dayText'
import ConfettiBurst from './ConfettiBurst'

export default function TaskList(props: {
  tasks: Task[]
  justDoneId: string | null
  pinnedId: string | null
  now: Date
  onComplete: (id: string) => void
}) {
  if (props.tasks.length === 0) {
    return <p className="empty-hint">Nothing here right now — add something small if you like.</p>
  }
  return (
    <ul className="task-list">
      {props.tasks.map((t) => (
        <li
          key={t.id}
          className={`task-card importance-${t.importance}${t.id === props.justDoneId ? ' done' : ''}`}
        >
          <button
            type="button"
            className="check"
            aria-label={`Mark "${t.title}" done`}
            onClick={() => props.onComplete(t.id)}
          />
          <span className="task-title">{t.title}</span>
          {t.dueDate && <span className="due-chip">{dueLabel(t.dueDate, t.dueTime, props.now)}</span>}
          {t.id === props.pinnedId && <span className="pinned-badge">up front ✨</span>}
          {t.id === props.justDoneId && <ConfettiBurst />}
        </li>
      ))}
    </ul>
  )
}
```

(`ConfettiBurst` is created in Task 3 — for THIS task's commit, create a placeholder `src/renderer/src/components/ConfettiBurst.tsx` containing `export default function ConfettiBurst() { return null }` so the build stays green; Task 3 replaces it.)

- [ ] **Step 3: App.tsx wiring.** Change `addTask` to:

```tsx
  function addTask(title: string, importance: Importance, dueDate?: string, dueTime?: string): void {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      importance,
      source: 'local',
      createdAt: new Date().toISOString(),
      ...(dueDate ? { dueDate } : {}),
      ...(dueTime ? { dueTime } : {})
    }
    update((d) => ({ ...d, tasks: [...d.tasks, task] }))
  }
```

Replace the `openTasks` line with (pinned stays in the list; only an unpinned suggestion is excluded):

```tsx
  const suggestedUnpinnedId = pinnedTask ? null : (oneThing?.id ?? null)
  const openTasks = data.tasks.filter(
    (t) => (!t.completedAt || t.id === justDoneId) && t.id !== suggestedUnpinnedId
  )
```

(This requires moving the `pinnedTask`/`oneThing` block ABOVE the `openTasks` line if it isn't already.)

Update the `TaskList` render call:

```tsx
        <TaskList
          tasks={openTasks}
          justDoneId={justDoneId}
          pinnedId={pinnedTask?.id ?? null}
          now={now}
          onComplete={completeTask}
        />
```

- [ ] **Step 4: theme.css additions** (append):

```css
.task-title { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }

.due-chip {
  flex: none;
  font-size: 11px;
  color: var(--text-faint);
  background: var(--rail-bg);
  border: 1px solid var(--rail-border);
  border-radius: 10px;
  padding: 2px 8px;
}

.pinned-badge {
  flex: none;
  font-size: 10px;
  letter-spacing: 0.3px;
  color: var(--accent-soft);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  border-radius: 10px;
  padding: 2px 8px;
}

.add-task input[type='date'],
.add-task input[type='time'] {
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text);
  border-radius: 8px;
  padding: 7px 8px;
  font-size: 12px;
}
.add-task input[type='time']:disabled { opacity: 0.45; }
```

- [ ] **Step 5: Gates + commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; 33 tests.

```bash
git add -A
git commit -m "feat: due date/time inputs, calm due chips, pinned task stays listed with badge"
```

---

### Task 3: Confetti celebration

**Files:**
- Replace: `src/renderer/src/components/ConfettiBurst.tsx`
- Modify: `src/renderer/src/App.tsx` (500ms → 850ms window), `src/renderer/src/theme.css`

**Interfaces:**
- Consumes: mounted inside `.task-card` (Task 2), which needs `position: relative`.
- Produces: `ConfettiBurst()` — self-contained, no props, renders 12 animated particles once on mount.

- [ ] **Step 1: Replace `ConfettiBurst.tsx` with:**

```tsx
const PARTICLES = Array.from({ length: 12 }, (_, i) => {
  const angle = (i / 12) * 2 * Math.PI
  const radius = 34 + (i % 3) * 14
  return {
    dx: Math.cos(angle) * radius,
    dy: Math.sin(angle) * radius - 10,
    rot: (i % 2 ? 1 : -1) * (120 + i * 20),
    color: (['high', 'medium', 'low', 'accent'] as const)[i % 4]
  }
})

export default function ConfettiBurst() {
  return (
    <span className="confetti" aria-hidden="true">
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={`confetti-piece confetti-${p.color}`}
          style={
            {
              '--dx': `${p.dx}px`,
              '--dy': `${p.dy}px`,
              '--rot': `${p.rot}deg`
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  )
}
```

- [ ] **Step 2: theme.css additions** (append; also add `position: relative;` to the existing `.task-card` rule):

```css
.confetti {
  position: absolute;
  left: 21px;
  top: 50%;
  width: 0;
  height: 0;
  pointer-events: none;
}

.confetti-piece {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 2px;
  animation: confetti-fly 750ms ease-out forwards;
}

.confetti-high { background: var(--edge-high); }
.confetti-medium { background: var(--edge-medium); }
.confetti-low { background: var(--edge-low); }
.confetti-accent { background: var(--accent); }

@keyframes confetti-fly {
  0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
  100% { transform: translate(var(--dx), var(--dy)) rotate(var(--rot)) scale(0.5); opacity: 0; }
}
```

- [ ] **Step 3: App.tsx** — change the celebration window from `500` to `850` (the `setTimeout` in `completeTask`).

- [ ] **Step 4: Gates + commit**

Run: `npm run typecheck && npm test && npm run build`
Expected: clean; 33 tests.

```bash
git add -A
git commit -m "feat: confetti burst celebration on task completion"
```
