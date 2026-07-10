# Ollibeu Core App Implementation Plan (Phase 1 of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fully working local-only Ollibeu: Electron app opens to the approved Option C dashboard with Sage Day / Forest Night themes, local task CRUD with importance edges, the Just One Thing card with pin + shuffle, gentle greeting/quotes, and a daily win count.

**Architecture:** Electron main process owns a single local JSON file (load/save over two IPC channels); the React renderer owns the in-memory `OllibeuData` object and persists the whole blob on every mutation. All decision logic (theme resolution, task picking, greeting, win counts) lives in `src/shared/` as pure functions so Vitest tests run without Electron.

**Tech Stack:** Electron ^31, electron-vite ^2, React ^18, TypeScript ^5 (strict), Vitest ^2. No other runtime dependencies in this phase.

**Later phases (not in this plan):** Phase 2 = Google OAuth + Calendar/Tasks sync (fills the Today rail). Phase 3 = idle ding, launch-at-login, onboarding, sounds, GitHub Actions installers.

## Global Constraints

- Node.js >= 20; npm as package manager; all commands run from repo root `/home/zephyriah_spaar/adhdTerminal`.
- TypeScript `strict: true` everywhere; renderer has `contextIsolation` on (Electron default) and never gets `nodeIntegration`.
- **No-guilt copy rule:** the words "overdue", "late", "failed", "behind" must not appear anywhere in UI strings. Missed tasks just stay in the list.
- Theme defaults: `nightStartsAt: "18:30"`, `dayStartsAt: "06:30"`, `theme: "auto"`.
- Importance edge colors (exact): high `#dc9a8e`, medium `#d7bd7e`, low `#8fbf9e`.
- Sage Day canvas: gradient `#f2f5ef → #e6ede3`, text `#33443a`, accent `#5d8a6e`. Forest Night canvas: gradient `#16211c → #22332a`, text `#e5efe8`, accent `#8fc4a4`.
- Other defaults: `idleDing: { enabled: false, thresholdMinutes: 10 }`, `gamificationEnabled: false`, `quotesEnabled: true`, `leaveByBufferMinutes: 25`, `launchAtLogin: true`.
- Data file: `<userData>/ollibeu-data.json`, written atomically (tmp file + rename).
- Commit after every task with the exact message given; `git push` only at the final task.

## File Structure

```
package.json                      — scripts + deps
electron.vite.config.ts           — main/preload/renderer build config, @shared alias
tsconfig.json                     — editor root (references only)
tsconfig.node.json                — main/preload/shared/tests typecheck
tsconfig.web.json                 — renderer typecheck
vitest.config.ts                  — test runner config
src/shared/types.ts               — Task/Settings/AppState/OllibeuData + DEFAULT_SETTINGS
src/shared/theme.ts               — resolveTheme() pure fn
src/shared/pickOne.ts             — isPickable/scoreTask/pickOneThing pure fns
src/shared/dayText.ts             — greetingFor()/completedTodayCount() pure fns
src/main/storage.ts               — loadData/saveData JSON persistence (path injected → testable)
src/main/index.ts                 — app entry, window, IPC registration
src/preload/index.ts              — contextBridge API (loadData/saveData)
src/renderer/index.html           — renderer entry html
src/renderer/src/main.tsx         — React mount
src/renderer/src/global.d.ts      — window.ollibeu typing
src/renderer/src/quotes.ts        — quote deck + quoteForDate()
src/renderer/src/theme.css        — CSS variables per theme + all component styles
src/renderer/src/App.tsx          — data owner, theme tick, layout (Option C)
src/renderer/src/components/Greeting.tsx
src/renderer/src/components/JustOneThing.tsx
src/renderer/src/components/TaskList.tsx
src/renderer/src/components/AddTask.tsx
src/renderer/src/components/TodayRail.tsx   — placeholder until Phase 2
tests/theme.test.ts
tests/pickOne.test.ts
tests/dayText.test.ts
tests/quotes.test.ts
tests/storage.test.ts
```

---

### Task 1: Project scaffold — Electron + Vite + React boots

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `vitest.config.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/index.html`, `src/renderer/src/main.tsx`, `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `npm run dev|build|typecheck|test` scripts; a window that loads the renderer; `@shared` import alias for the renderer; preload at `src/preload/index.ts` loaded by the window. Later tasks replace `App.tsx` and extend `src/main/index.ts` and `src/preload/index.ts`.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "ollibeu",
  "version": "0.1.0",
  "description": "A calming desktop dashboard for ADHD brains — see your day, do one thing, no guilt.",
  "license": "MIT",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.1",
    "electron": "^31.3.0",
    "electron-vite": "^2.3.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `electron.vite.config.ts`**

```ts
import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') }
    },
    plugins: [react()]
  }
})
```

- [ ] **Step 3: Write the three tsconfig files**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.node.json" }, { "path": "./tsconfig.web.json" }]
}
```

`tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "composite": true,
    "types": ["node"]
  },
  "include": ["src/main/**/*", "src/preload/**/*", "src/shared/**/*", "tests/**/*", "electron.vite.config.ts", "vitest.config.ts"]
}
```

`tsconfig.web.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "composite": true,
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "paths": { "@shared/*": ["./src/shared/*"] }
  },
  "include": ["src/renderer/src/**/*", "src/shared/**/*"]
}
```

- [ ] **Step 4: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] }
})
```

- [ ] **Step 5: Write minimal main, preload, and renderer**

`src/main/index.ts`:

```ts
import { app, BrowserWindow } from 'electron'
import path from 'path'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    backgroundColor: '#f2f5ef',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') }
  })
  win.once('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

`src/preload/index.ts`:

```ts
// IPC API arrives in Task 5. Preload must exist so the window config is stable.
export {}
```

`src/renderer/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Ollibeu</title>
    <meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/renderer/src/main.tsx`:

```tsx
import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

`src/renderer/src/App.tsx` (placeholder, replaced in Task 6):

```tsx
export default function App() {
  return <h1>Ollibeu is alive 🌿</h1>
}
```

- [ ] **Step 6: Install and verify**

Run: `npm install` (downloads Electron ~100MB; needs network)
Then: `npm run typecheck`
Expected: both tsc invocations exit 0, no output.
Then: `npm run build`
Expected: electron-vite prints `built in …` for main, preload, and renderer; `out/` directory appears.
If a display is available (WSLg / native), also run `npm run dev` — a 1100×720 window titled "Ollibeu" opens showing "Ollibeu is alive 🌿". Ctrl+C to stop. If headless, the build passing is sufficient.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Electron + Vite + React app shell"
```

---

### Task 2: Shared types + theme resolver

**Files:**
- Create: `src/shared/types.ts`, `src/shared/theme.ts`
- Test: `tests/theme.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: all types in `types.ts` exactly as written below (every later task imports from here); `resolveTheme(now: Date, settings: Pick<Settings, 'theme' | 'nightStartsAt' | 'dayStartsAt'>): 'day' | 'night'`.

- [ ] **Step 1: Write `src/shared/types.ts`** (types have no behavior; they're exercised by this task's theme tests and every later test)

```ts
export type Importance = 'high' | 'medium' | 'low'
export type TaskSource = 'local' | 'gtasks'

export interface Task {
  id: string
  title: string
  importance: Importance
  source: TaskSource
  gtasksId?: string
  gtasksListId?: string
  dueDate?: string // ISO date "YYYY-MM-DD"
  estimateMinutes?: number
  createdAt: string // ISO datetime
  completedAt?: string // ISO datetime
  snoozedUntil?: string // ISO datetime
}

export interface IdleDingSettings {
  enabled: boolean
  thresholdMinutes: number
}

export interface Settings {
  displayName: string
  theme: 'auto' | 'day' | 'night'
  nightStartsAt: string // "HH:MM" 24h
  dayStartsAt: string // "HH:MM" 24h
  idleDing: IdleDingSettings
  gamificationEnabled: boolean
  quotesEnabled: boolean
  leaveByBufferMinutes: number
  launchAtLogin: boolean
}

export interface AppState {
  activeTaskId?: string // task pinned via "I'll do this one"
}

export interface OllibeuData {
  tasks: Task[]
  settings: Settings
  appState: AppState
}

export const DEFAULT_SETTINGS: Settings = {
  displayName: '',
  theme: 'auto',
  nightStartsAt: '18:30',
  dayStartsAt: '06:30',
  idleDing: { enabled: false, thresholdMinutes: 10 },
  gamificationEnabled: false,
  quotesEnabled: true,
  leaveByBufferMinutes: 25,
  launchAtLogin: true
}
```

- [ ] **Step 2: Write the failing test `tests/theme.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../src/shared/theme'

const auto = { theme: 'auto' as const, nightStartsAt: '18:30', dayStartsAt: '06:30' }

function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 6, 10, h, m)
}

describe('resolveTheme', () => {
  it('is day during the afternoon', () => {
    expect(resolveTheme(at('14:00'), auto)).toBe('day')
  })
  it('flips to night exactly at 18:30', () => {
    expect(resolveTheme(at('18:29'), auto)).toBe('day')
    expect(resolveTheme(at('18:30'), auto)).toBe('night')
  })
  it('flips to day exactly at 06:30', () => {
    expect(resolveTheme(at('06:29'), auto)).toBe('night')
    expect(resolveTheme(at('06:30'), auto)).toBe('day')
  })
  it('is night at midnight', () => {
    expect(resolveTheme(at('00:00'), auto)).toBe('night')
  })
  it('manual override wins over the clock', () => {
    expect(resolveTheme(at('23:00'), { ...auto, theme: 'day' })).toBe('day')
    expect(resolveTheme(at('12:00'), { ...auto, theme: 'night' })).toBe('night')
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/theme.test.ts`
Expected: FAIL — `Cannot find module '../src/shared/theme'` (or equivalent resolve error).

- [ ] **Step 4: Write `src/shared/theme.ts`**

```ts
import type { Settings } from './types'

export type ResolvedTheme = 'day' | 'night'

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function resolveTheme(
  now: Date,
  settings: Pick<Settings, 'theme' | 'nightStartsAt' | 'dayStartsAt'>
): ResolvedTheme {
  if (settings.theme !== 'auto') return settings.theme
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= minutesOf(settings.dayStartsAt) && mins < minutesOf(settings.nightStartsAt)
    ? 'day'
    : 'night'
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/theme.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/theme.ts tests/theme.test.ts
git commit -m "feat: shared data types and day/night theme resolver"
```

---

### Task 3: Just One Thing picker

**Files:**
- Create: `src/shared/pickOne.ts`
- Test: `tests/pickOne.test.ts`

**Interfaces:**
- Consumes: `Task`, `Importance` from `src/shared/types.ts`.
- Produces: `isPickable(task: Task, now: Date): boolean`; `scoreTask(task: Task, now: Date): number`; `pickOneThing(tasks: Task[], now: Date, excludeIds?: string[]): Task | null`. Task 8 calls `pickOneThing` with the renderer's session-local shuffle exclusions.

- [ ] **Step 1: Write the failing test `tests/pickOne.test.ts`**

```ts
import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { pickOneThing } from '../src/shared/pickOne'

const NOW = new Date('2026-07-10T14:00:00')

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    importance: 'medium',
    source: 'local',
    createdAt: '2026-07-09T09:00:00',
    ...overrides
  }
}

describe('pickOneThing', () => {
  it('returns null for no tasks', () => {
    expect(pickOneThing([], NOW)).toBeNull()
  })

  it('prefers higher importance', () => {
    const tasks = [task({ id: 'a', importance: 'low' }), task({ id: 'b', importance: 'high' })]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('a looming due date beats plain high importance', () => {
    const tasks = [
      task({ id: 'a', importance: 'high' }),
      task({ id: 'b', importance: 'medium', dueDate: '2026-07-10' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('older tasks gently rise', () => {
    const tasks = [
      task({ id: 'a', createdAt: '2026-07-09T09:00:00' }),
      task({ id: 'b', createdAt: '2026-06-01T09:00:00' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('never picks completed or snoozed tasks', () => {
    const tasks = [
      task({ id: 'a', importance: 'high', completedAt: '2026-07-10T10:00:00' }),
      task({ id: 'b', importance: 'high', snoozedUntil: '2026-07-11T00:00:00' }),
      task({ id: 'c', importance: 'low' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('c')
  })

  it('a past snooze no longer excludes', () => {
    const tasks = [task({ id: 'a', snoozedUntil: '2026-07-10T09:00:00' })]
    expect(pickOneThing(tasks, NOW)?.id).toBe('a')
  })

  it('respects shuffle exclusions and returns null when all excluded', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' })]
    expect(pickOneThing(tasks, NOW, ['a'])?.id).toBe('b')
    expect(pickOneThing(tasks, NOW, ['a', 'b'])).toBeNull()
  })

  it('ties break stably by id', () => {
    const tasks = [task({ id: 'z' }), task({ id: 'a' })]
    expect(pickOneThing(tasks, NOW)?.id).toBe('a')
    expect(pickOneThing([...tasks].reverse(), NOW)?.id).toBe('a')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pickOne.test.ts`
Expected: FAIL — cannot find module `../src/shared/pickOne`.

- [ ] **Step 3: Write `src/shared/pickOne.ts`**

```ts
import type { Task } from './types'

const IMPORTANCE_SCORE: Record<Task['importance'], number> = {
  high: 100,
  medium: 50,
  low: 0
}

const DAY_MS = 86_400_000

export function isPickable(task: Task, now: Date): boolean {
  if (task.completedAt) return false
  if (task.snoozedUntil && new Date(task.snoozedUntil) > now) return false
  return true
}

export function scoreTask(task: Task, now: Date): number {
  let score = IMPORTANCE_SCORE[task.importance]
  if (task.dueDate) {
    const daysUntilDue = (new Date(task.dueDate + 'T23:59:59').getTime() - now.getTime()) / DAY_MS
    if (daysUntilDue <= 0) score += 80
    else if (daysUntilDue <= 1) score += 60
    else if (daysUntilDue <= 3) score += 30
    else if (daysUntilDue <= 7) score += 10
  }
  const ageDays = (now.getTime() - new Date(task.createdAt).getTime()) / DAY_MS
  score += Math.min(Math.max(ageDays, 0) * 2, 20)
  return score
}

export function pickOneThing(tasks: Task[], now: Date, excludeIds: string[] = []): Task | null {
  const candidates = tasks.filter((t) => isPickable(t, now) && !excludeIds.includes(t.id))
  if (candidates.length === 0) return null
  return [...candidates].sort(
    (a, b) => scoreTask(b, now) - scoreTask(a, now) || a.id.localeCompare(b.id)
  )[0]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pickOne.test.ts`
Expected: PASS — 8 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/shared/pickOne.ts tests/pickOne.test.ts
git commit -m "feat: just-one-thing task picker heuristic"
```

---

### Task 4: Greeting, win count, and quote deck

**Files:**
- Create: `src/shared/dayText.ts`, `src/renderer/src/quotes.ts`
- Test: `tests/dayText.test.ts`, `tests/quotes.test.ts`

**Interfaces:**
- Consumes: `Task` from `src/shared/types.ts`.
- Produces: `greetingFor(now: Date, night: boolean): string`; `completedTodayCount(tasks: Task[], now: Date): number`; `quoteForDate(date: Date): string` and `QUOTES: string[]` (renderer-only module, imported by Task 6's `App.tsx`).

- [ ] **Step 1: Write the failing tests**

`tests/dayText.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { completedTodayCount, greetingFor } from '../src/shared/dayText'

function at(h: number, m = 0): Date {
  return new Date(2026, 6, 10, h, m)
}

describe('greetingFor', () => {
  it('morning before noon', () => {
    expect(greetingFor(at(8), false)).toBe('Good morning')
  })
  it('afternoon from noon to 5pm', () => {
    expect(greetingFor(at(12), false)).toBe('Good afternoon')
    expect(greetingFor(at(16, 59), false)).toBe('Good afternoon')
  })
  it('evening from 5pm', () => {
    expect(greetingFor(at(17), false)).toBe('Good evening')
  })
  it('night mode always winds down', () => {
    expect(greetingFor(at(20), true)).toBe('Winding down')
    expect(greetingFor(at(5), true)).toBe('Winding down')
  })
})

describe('completedTodayCount', () => {
  const base: Omit<Task, 'id'> = {
    title: 't',
    importance: 'low',
    source: 'local',
    createdAt: '2026-07-01T09:00:00'
  }
  it('counts only completions from today', () => {
    const tasks: Task[] = [
      { ...base, id: 'a', completedAt: '2026-07-10T09:00:00' },
      { ...base, id: 'b', completedAt: '2026-07-09T23:59:00' },
      { ...base, id: 'c' }
    ]
    expect(completedTodayCount(tasks, at(14))).toBe(1)
  })
})
```

`tests/quotes.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { QUOTES, quoteForDate } from '../src/renderer/src/quotes'

describe('quoteForDate', () => {
  it('has a non-trivial deck', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(10)
  })
  it('is stable within a day and drawn from the deck', () => {
    const q = quoteForDate(new Date(2026, 6, 10, 9))
    expect(q).toBe(quoteForDate(new Date(2026, 6, 10, 22)))
    expect(QUOTES).toContain(q)
  })
  it('changes across consecutive days', () => {
    expect(quoteForDate(new Date(2026, 6, 10))).not.toBe(quoteForDate(new Date(2026, 6, 11)))
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/dayText.test.ts tests/quotes.test.ts`
Expected: FAIL — both modules not found.

- [ ] **Step 3: Write `src/shared/dayText.ts`**

```ts
import type { Task } from './types'

export function greetingFor(now: Date, night: boolean): string {
  if (night) return 'Winding down'
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function completedTodayCount(tasks: Task[], now: Date): number {
  return tasks.filter((t) => t.completedAt && sameDay(new Date(t.completedAt), now)).length
}
```

- [ ] **Step 4: Write `src/renderer/src/quotes.ts`**

```ts
export const QUOTES: string[] = [
  'Small steps still move you forward.',
  'Done is kinder than perfect.',
  'You can do the next five minutes.',
  'Starting badly beats not starting.',
  'Your brain is not broken — it just boots differently.',
  'One thing at a time is still momentum.',
  'Rest is part of the work.',
  'Future you says thanks for the little things.',
  'It counts even if it was easy.',
  'You have done hard things before breakfast.',
  'Half a task is not zero tasks.',
  'Gentle beats urgent, most days.'
]

export function quoteForDate(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return QUOTES[dayOfYear % QUOTES.length]
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/dayText.test.ts tests/quotes.test.ts`
Expected: PASS — 8 tests passed across both files.

- [ ] **Step 6: Commit**

```bash
git add src/shared/dayText.ts src/renderer/src/quotes.ts tests/dayText.test.ts tests/quotes.test.ts
git commit -m "feat: greeting, daily win count, and gentle quote deck"
```

---

### Task 5: Persistence + IPC bridge

**Files:**
- Create: `src/main/storage.ts`, `src/renderer/src/global.d.ts`
- Modify: `src/main/index.ts` (register IPC handlers), `src/preload/index.ts` (expose API)
- Test: `tests/storage.test.ts`

**Interfaces:**
- Consumes: `OllibeuData`, `DEFAULT_SETTINGS` from `src/shared/types.ts`.
- Produces: `emptyData(): OllibeuData`, `loadData(filePath: string): Promise<OllibeuData>`, `saveData(filePath: string, data: OllibeuData): Promise<void>`; renderer-visible `window.ollibeu.loadData(): Promise<OllibeuData>` and `window.ollibeu.saveData(data: OllibeuData): Promise<void>`. Task 6's `App.tsx` is built on `window.ollibeu`.

- [ ] **Step 1: Write the failing test `tests/storage.test.ts`**

```ts
import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptyData, loadData, saveData } from '../src/main/storage'
import { DEFAULT_SETTINGS } from '../src/shared/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ollibeu-'))
})

describe('storage', () => {
  it('returns defaults when the file does not exist', async () => {
    const data = await loadData(path.join(dir, 'missing.json'))
    expect(data.tasks).toEqual([])
    expect(data.settings).toEqual(DEFAULT_SETTINGS)
    expect(data.appState).toEqual({})
  })

  it('round-trips data through save and load', async () => {
    const file = path.join(dir, 'data.json')
    const data = emptyData()
    data.tasks.push({
      id: 'a',
      title: 'Water the plants',
      importance: 'low',
      source: 'local',
      createdAt: '2026-07-10T09:00:00'
    })
    data.settings.displayName = 'Maya'
    data.appState.activeTaskId = 'a'
    await saveData(file, data)
    expect(await loadData(file)).toEqual(data)
  })

  it('survives a corrupt file by falling back to defaults', async () => {
    const file = path.join(dir, 'data.json')
    await writeFile(file, '{not json!!', 'utf8')
    const data = await loadData(file)
    expect(data.settings).toEqual(DEFAULT_SETTINGS)
  })

  it('fills missing settings keys from defaults (forward migration)', async () => {
    const file = path.join(dir, 'data.json')
    await writeFile(file, JSON.stringify({ tasks: [], settings: { displayName: 'Maya' } }), 'utf8')
    const data = await loadData(file)
    expect(data.settings.displayName).toBe('Maya')
    expect(data.settings.nightStartsAt).toBe('18:30')
    expect(data.settings.idleDing).toEqual({ enabled: false, thresholdMinutes: 10 })
  })

  it('writes atomically (no .tmp file left behind, valid JSON on disk)', async () => {
    const file = path.join(dir, 'data.json')
    await saveData(file, emptyData())
    expect(JSON.parse(await readFile(file, 'utf8')).settings.theme).toBe('auto')
    await expect(readFile(file + '.tmp')).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/storage.test.ts`
Expected: FAIL — cannot find module `../src/main/storage`.

- [ ] **Step 3: Write `src/main/storage.ts`**

```ts
import { promises as fs } from 'fs'
import path from 'path'
import { DEFAULT_SETTINGS, type OllibeuData } from '../shared/types'

export function emptyData(): OllibeuData {
  return {
    tasks: [],
    settings: { ...DEFAULT_SETTINGS, idleDing: { ...DEFAULT_SETTINGS.idleDing } },
    appState: {}
  }
}

export async function loadData(filePath: string): Promise<OllibeuData> {
  let parsed: Partial<OllibeuData>
  try {
    parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
  } catch {
    return emptyData()
  }
  const base = emptyData()
  return {
    tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
    settings: {
      ...base.settings,
      ...parsed.settings,
      idleDing: { ...base.settings.idleDing, ...parsed.settings?.idleDing }
    },
    appState: { ...parsed.appState }
  }
}

export async function saveData(filePath: string, data: OllibeuData): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = filePath + '.tmp'
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8')
  await fs.rename(tmp, filePath)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/storage.test.ts`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Wire IPC in main — replace `src/main/index.ts` with:**

```ts
import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'path'
import type { OllibeuData } from '../shared/types'
import { loadData, saveData } from './storage'

const dataPath = (): string => path.join(app.getPath('userData'), 'ollibeu-data.json')

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    show: false,
    backgroundColor: '#f2f5ef',
    webPreferences: { preload: path.join(__dirname, '../preload/index.js') }
  })
  win.once('ready-to-show', () => win.show())
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  ipcMain.handle('data:load', () => loadData(dataPath()))
  ipcMain.handle('data:save', (_event, data: OllibeuData) => saveData(dataPath(), data))
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 6: Expose the API — replace `src/preload/index.ts` with:**

```ts
import { contextBridge, ipcRenderer } from 'electron'
import type { OllibeuData } from '../shared/types'

contextBridge.exposeInMainWorld('ollibeu', {
  loadData: (): Promise<OllibeuData> => ipcRenderer.invoke('data:load'),
  saveData: (data: OllibeuData): Promise<void> => ipcRenderer.invoke('data:save', data)
})
```

And type it for the renderer — `src/renderer/src/global.d.ts`:

```ts
import type { OllibeuData } from '@shared/types'

declare global {
  interface Window {
    ollibeu: {
      loadData(): Promise<OllibeuData>
      saveData(data: OllibeuData): Promise<void>
    }
  }
}

export {}
```

- [ ] **Step 7: Full verification**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; all test files pass (theme, pickOne, dayText, quotes, storage); build succeeds.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: atomic JSON persistence with IPC bridge to renderer"
```

---

### Task 6: Renderer shell — themes, layout skeleton, greeting

**Files:**
- Create: `src/renderer/src/theme.css`, `src/renderer/src/components/Greeting.tsx`
- Modify: `src/renderer/src/App.tsx` (full replacement)

**Interfaces:**
- Consumes: `window.ollibeu` (Task 5), `resolveTheme` (Task 2), `greetingFor` (Task 4), `quoteForDate` (Task 4).
- Produces: `App` owning `data: OllibeuData | null` state and an `update(fn: (d: OllibeuData) => OllibeuData): void` mutator; CSS classes used by Tasks 7–9: `.card`, `.task-card`, `.importance-high|medium|low`, `.one-thing`, `.today-rail`, `.pill-button`, `.section-label`. `App` renders `<main class="layout">` with a left `<div class="focus-column">` and right `<TodayRail />`. Greeting component signature: `Greeting({ name, now, night, quote }: { name: string; now: Date; night: boolean; quote: string | null })`.

- [ ] **Step 1: Write `src/renderer/src/theme.css`**

```css
:root {
  --edge-high: #dc9a8e;
  --edge-medium: #d7bd7e;
  --edge-low: #8fbf9e;
  --radius-card: 12px;
  font-family: 'Segoe UI', 'SF Pro Text', system-ui, sans-serif;
}

:root[data-theme='day'] {
  --bg-a: #f2f5ef;
  --bg-b: #e6ede3;
  --text: #33443a;
  --text-soft: #7d9488;
  --text-faint: #93a89a;
  --accent: #5d8a6e;
  --accent-soft: #6e9a7f;
  --card-bg: #ffffff;
  --card-border: #d8e3d6;
  --card-shadow: 0 2px 8px rgba(120, 150, 130, 0.12);
  --rail-bg: rgba(255, 255, 255, 0.5);
  --rail-border: #dde7da;
}

:root[data-theme='night'] {
  --bg-a: #16211c;
  --bg-b: #22332a;
  --text: #e5efe8;
  --text-soft: #8fac9c;
  --text-faint: #7d9a8a;
  --accent: #8fc4a4;
  --accent-soft: #9ecbb0;
  --card-bg: rgba(150, 200, 170, 0.09);
  --card-border: rgba(160, 210, 180, 0.18);
  --card-shadow: none;
  --rail-bg: rgba(150, 200, 170, 0.06);
  --rail-border: rgba(160, 210, 180, 0.15);
}

* { box-sizing: border-box; margin: 0; }

body {
  background: linear-gradient(160deg, var(--bg-a) 0%, var(--bg-b) 100%);
  color: var(--text);
  min-height: 100vh;
  transition: background 0.6s ease, color 0.6s ease;
}

#root { max-width: 760px; margin: 0 auto; padding: 40px 28px; }

.greeting { text-align: center; margin-bottom: 24px; }
.greeting .date-line { color: var(--text-faint); font-size: 13px; }
.greeting h1 { font-size: 26px; font-weight: 600; margin: 4px 0; }
.greeting .quote { color: var(--text-faint); font-style: italic; font-size: 14px; }

.layout { display: flex; gap: 24px; align-items: flex-start; }
.focus-column { flex: 1.6; min-width: 0; }

.card {
  background: var(--card-bg);
  border: 1px solid var(--card-border);
  border-radius: var(--radius-card);
  box-shadow: var(--card-shadow);
}

.one-thing { padding: 18px; text-align: center; margin-bottom: 18px; }
.one-thing .section-label { margin-bottom: 4px; }
.one-thing .title { font-size: 17px; font-weight: 600; }
.one-thing .estimate { color: var(--text-faint); font-size: 12px; margin-top: 3px; }
.one-thing .actions { margin-top: 12px; display: flex; gap: 10px; justify-content: center; }

.section-label {
  color: var(--text-soft);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.pill-button {
  border: none;
  border-radius: 20px;
  padding: 7px 18px;
  font-size: 13px;
  cursor: pointer;
  background: var(--accent);
  color: var(--bg-a);
}
.pill-button.quiet { background: transparent; color: var(--text-soft); }

.task-list { list-style: none; padding: 0; margin: 8px 0 0; }
.task-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  margin-bottom: 7px;
  border-left-width: 3px;
  border-left-style: solid;
  border-radius: 8px;
  font-size: 14px;
}
.task-card.importance-high { border-left-color: var(--edge-high); }
.task-card.importance-medium { border-left-color: var(--edge-medium); }
.task-card.importance-low { border-left-color: var(--edge-low); }
.task-card.done { animation: pop-done 0.45s ease; opacity: 0.55; }

@keyframes pop-done {
  0% { transform: scale(1); }
  40% { transform: scale(1.03); }
  100% { transform: scale(1); }
}

.check {
  width: 20px;
  height: 20px;
  flex: none;
  border: 2px solid var(--text-faint);
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}
.check:hover { border-color: var(--accent); }

.empty-hint { color: var(--text-faint); font-size: 13px; margin-top: 8px; }

.add-task { display: flex; gap: 8px; margin-top: 12px; }
.add-task input[type='text'] {
  flex: 1;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
}
.add-task select {
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text);
  border-radius: 8px;
  font-size: 13px;
}

.today-rail { flex: 1; padding: 14px 16px; align-self: flex-start; border-radius: var(--radius-card); background: var(--rail-bg); border: 1px solid var(--rail-border); }
.today-rail .placeholder-copy { color: var(--text-faint); font-size: 13px; margin-top: 8px; line-height: 1.5; }

.win-line { text-align: center; color: var(--text-faint); font-size: 13px; margin-top: 20px; }

@media (max-width: 640px) {
  .layout { flex-direction: column; }
  .today-rail { width: 100%; }
}
```

- [ ] **Step 2: Write `src/renderer/src/components/Greeting.tsx`**

```tsx
import { greetingFor } from '@shared/dayText'

export default function Greeting(props: {
  name: string
  now: Date
  night: boolean
  quote: string | null
}) {
  const dateLine =
    props.now.toLocaleDateString(undefined, { weekday: 'long' }) +
    ', ' +
    props.now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  return (
    <header className="greeting">
      <div className="date-line">{dateLine}</div>
      <h1>
        {greetingFor(props.now, props.night)}
        {props.name ? `, ${props.name}` : ''} {props.night ? '🌙' : '🌿'}
      </h1>
      {props.quote && <div className="quote">“{props.quote}”</div>}
    </header>
  )
}
```

- [ ] **Step 3: Replace `src/renderer/src/App.tsx` with the shell** (JustOneThing/TaskList/AddTask/TodayRail arrive in Tasks 7–9; the shell compiles standalone)

```tsx
import { useEffect, useState } from 'react'
import type { OllibeuData } from '@shared/types'
import { resolveTheme } from '@shared/theme'
import Greeting from './components/Greeting'
import { quoteForDate } from './quotes'
import './theme.css'

export default function App() {
  const [data, setData] = useState<OllibeuData | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    window.ollibeu.loadData().then(setData)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(tick)
  }, [])

  const night = data ? resolveTheme(now, data.settings) === 'night' : false
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
  }, [night])

  function update(fn: (d: OllibeuData) => OllibeuData): void {
    setData((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      void window.ollibeu.saveData(next)
      return next
    })
  }
  void update // used from Task 7 onward

  if (!data) return null

  return (
    <>
      <Greeting
        name={data.settings.displayName}
        now={now}
        night={night}
        quote={data.settings.quotesEnabled ? quoteForDate(now) : null}
      />
      <main className="layout">
        <div className="focus-column">{/* JustOneThing + TaskList land in Tasks 7–8 */}</div>
        {/* TodayRail lands in Task 9 */}
      </main>
    </>
  )
}
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm run build`
Expected: clean typecheck, successful build.
If a display is available run `npm run dev`: window shows the centered greeting ("Good afternoon 🌿" etc.), the day's quote in italics, on the Sage Day gradient; at/after 18:30 (or by temporarily setting your system clock) the Forest Night palette applies with "Winding down".

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: themed renderer shell with greeting and auto day/night switch"
```

---

### Task 7: Task list — add, complete, importance edges

**Files:**
- Create: `src/renderer/src/components/TaskList.tsx`, `src/renderer/src/components/AddTask.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `update()` pattern from Task 6, `Task`/`Importance` types, `completedTodayCount` (Task 4).
- Produces: `TaskList({ tasks, justDoneId, onComplete }: { tasks: Task[]; justDoneId: string | null; onComplete: (id: string) => void })`; `AddTask({ onAdd }: { onAdd: (title: string, importance: Importance) => void })`. Task 8 reuses `onComplete` for the one-thing card.

- [ ] **Step 1: Write `src/renderer/src/components/TaskList.tsx`**

```tsx
import type { Task } from '@shared/types'

export default function TaskList(props: {
  tasks: Task[]
  justDoneId: string | null
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
            className="check"
            aria-label={`Mark "${t.title}" done`}
            onClick={() => props.onComplete(t.id)}
          />
          <span>{t.title}</span>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 2: Write `src/renderer/src/components/AddTask.tsx`**

```tsx
import { useState } from 'react'
import type { Importance } from '@shared/types'

export default function AddTask(props: { onAdd: (title: string, importance: Importance) => void }) {
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState<Importance>('medium')

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.onAdd(trimmed, importance)
    setTitle('')
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
      <button type="submit" className="pill-button">
        add
      </button>
    </form>
  )
}
```

- [ ] **Step 3: Wire into `App.tsx`** — add imports and handlers, and fill the focus column. Add to the imports:

```tsx
import type { Importance, OllibeuData, Task } from '@shared/types'
import { completedTodayCount } from '@shared/dayText'
import TaskList from './components/TaskList'
import AddTask from './components/AddTask'
```

Add state + handlers inside `App` (after the `update` definition; delete the `void update` line):

```tsx
const [justDoneId, setJustDoneId] = useState<string | null>(null)

function addTask(title: string, importance: Importance): void {
  const task: Task = {
    id: crypto.randomUUID(),
    title,
    importance,
    source: 'local',
    createdAt: new Date().toISOString()
  }
  update((d) => ({ ...d, tasks: [...d.tasks, task] }))
}

function completeTask(id: string): void {
  setJustDoneId(id)
  update((d) => ({
    ...d,
    tasks: d.tasks.map((t) => (t.id === id ? { ...t, completedAt: new Date().toISOString() } : t)),
    appState: d.appState.activeTaskId === id ? {} : d.appState
  }))
  setTimeout(() => setJustDoneId(null), 500)
}
```

Replace the focus-column div and add the win line so the returned JSX is:

```tsx
const openTasks = data.tasks.filter((t) => !t.completedAt)
const wins = completedTodayCount(data.tasks, now)

return (
  <>
    <Greeting
      name={data.settings.displayName}
      now={now}
      night={night}
      quote={data.settings.quotesEnabled ? quoteForDate(now) : null}
    />
    <main className="layout">
      <div className="focus-column">
        <div className="section-label">The rest — no rush</div>
        <TaskList tasks={openTasks} justDoneId={justDoneId} onComplete={completeTask} />
        <AddTask onAdd={addTask} />
      </div>
      {/* TodayRail lands in Task 9 */}
    </main>
    {wins > 0 && (
      <div className="win-line">
        {wins} {wins === 1 ? 'thing' : 'things'} today ✨
      </div>
    )}
  </>
)
```

- [ ] **Step 4: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean/passing.
With a display, `npm run dev`: add tasks with each importance and confirm the red/amber/green left edges; check one off — it pops gently, disappears from the open list, and "1 thing today ✨" appears. Restart the app — tasks persist.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: local task list with add, complete, and importance edges"
```

---

### Task 8: Just One Thing card — suggest, pin, shuffle

**Files:**
- Create: `src/renderer/src/components/JustOneThing.tsx`
- Modify: `src/renderer/src/App.tsx`

**Interfaces:**
- Consumes: `pickOneThing` (Task 3), `update`/`completeTask` (Tasks 6–7), `AppState.activeTaskId` (Task 2 types).
- Produces: `JustOneThing({ task, pinned, onStart, onShuffle, onComplete }: { task: Task; pinned: boolean; onStart: () => void; onShuffle: () => void; onComplete: () => void })`.

- [ ] **Step 1: Write `src/renderer/src/components/JustOneThing.tsx`**

```tsx
import type { Task } from '@shared/types'

export default function JustOneThing(props: {
  task: Task
  pinned: boolean
  onStart: () => void
  onShuffle: () => void
  onComplete: () => void
}) {
  return (
    <section className="card one-thing">
      <div className="section-label">Just one thing</div>
      <div className="title">{props.task.title}</div>
      {props.task.estimateMinutes && (
        <div className="estimate">~{props.task.estimateMinutes} minutes, and it’s off your mind</div>
      )}
      <div className="actions">
        {props.pinned ? (
          <button className="pill-button" onClick={props.onComplete}>
            done ✓
          </button>
        ) : (
          <button className="pill-button" onClick={props.onStart}>
            I’ll do this one →
          </button>
        )}
        <button className="pill-button quiet" onClick={props.onShuffle}>
          not this one
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Wire into `App.tsx`.** Add imports:

```tsx
import { pickOneThing } from '@shared/pickOne'
import JustOneThing from './components/JustOneThing'
```

Add state + selection logic inside `App` (near the other state):

```tsx
const [shuffledAway, setShuffledAway] = useState<string[]>([])

const pinnedTask = data?.tasks.find(
  (t) => t.id === data.appState.activeTaskId && !t.completedAt
)
const oneThing = data ? pinnedTask ?? pickOneThing(data.tasks, now, shuffledAway) : null

function startOneThing(id: string): void {
  update((d) => ({ ...d, appState: { ...d.appState, activeTaskId: id } }))
}

function shuffleOneThing(id: string): void {
  setShuffledAway((prev) => [...prev, id])
  if (pinnedTask?.id === id) update((d) => ({ ...d, appState: {} }))
}
```

Render it at the top of the focus column, above the task list section label:

```tsx
{oneThing && (
  <JustOneThing
    task={oneThing}
    pinned={pinnedTask?.id === oneThing.id}
    onStart={() => startOneThing(oneThing.id)}
    onShuffle={() => shuffleOneThing(oneThing.id)}
    onComplete={() => completeTask(oneThing.id)}
  />
)}
```

And exclude the suggested task from the list below so it isn't shown twice — change the `openTasks` line to:

```tsx
const openTasks = data.tasks.filter((t) => !t.completedAt && t.id !== oneThing?.id)
```

- [ ] **Step 3: Verify**

Run: `npm run typecheck && npm test && npm run build`
Expected: all clean/passing.
With a display, `npm run dev`: the highest-priority task appears in the card; "not this one" swaps it for the next candidate (never repeating within the session); "I'll do this one →" pins it (button becomes "done ✓") and survives an app restart; completing it clears the pin and celebrates.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: just-one-thing card with pin and no-guilt shuffle"
```

---

### Task 9: Today rail placeholder + finish the core layout

**Files:**
- Create: `src/renderer/src/components/TodayRail.tsx`
- Modify: `src/renderer/src/App.tsx`, `README.md` (create)

**Interfaces:**
- Consumes: theme CSS classes (Task 6).
- Produces: `TodayRail({ night }: { night: boolean })` — Phase 2 replaces its body with live calendar data but keeps the component name, prop, and `.today-rail` class.

- [ ] **Step 1: Write `src/renderer/src/components/TodayRail.tsx`**

```tsx
export default function TodayRail(props: { night: boolean }) {
  return (
    <aside className="today-rail">
      <div className="section-label">Today</div>
      <p className="placeholder-copy">
        Your calendar will live here once Google is connected — appointments, gentle
        “leave by” nudges, and what tomorrow looks like.
      </p>
      <p className="placeholder-copy">{props.night ? 'Rest is productive too. ✨' : 'One thing at a time. 🍃'}</p>
    </aside>
  )
}
```

- [ ] **Step 2: Render it in `App.tsx`** — import `TodayRail` and replace the `{/* TodayRail lands in Task 9 */}` comment with:

```tsx
<TodayRail night={night} />
```

- [ ] **Step 3: Create `README.md`**

```markdown
# Ollibeu 🌿

A calming desktop dashboard for ADHD brains — see your day, do one thing, no guilt.

Ollibeu opens with your computer and shows a gentle picture of your day: one suggested
next task, the rest of your list with soft importance colors, and (soon) your Google
Calendar. It never shames you about anything.

**Status: early development.** Google Calendar/Tasks sync, idle reminders, and
downloadable installers are coming in the next phases.

## Development

```bash
npm install
npm run dev        # launch the app with hot reload
npm test           # unit tests (Vitest)
npm run typecheck  # strict TS across main + renderer
npm run build      # production bundles
```

MIT licensed.
```

- [ ] **Step 4: Add `LICENSE`** (MIT, standard text, copyright line: `Copyright (c) 2026 Zephyriah Spaar`)

```
MIT License

Copyright (c) 2026 Zephyriah Spaar

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 5: Final verification of the whole phase**

Run: `npm run typecheck && npm test && npm run build`
Expected: typecheck clean; 5 test files, all passing; build succeeds.
With a display, `npm run dev` and walk the full loop: greeting + quote → one thing card → shuffle → pin → add tasks with each importance → complete some → win line appears → rail placeholder present → after 18:30 everything shifts to Forest Night with "Winding down".

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "feat: today rail placeholder, README, and MIT license"
git push
```

---

## Execution Amendments

- **Task 7 (commit 001f183):** the plan's `completeTask` + `openTasks` filter made the pop-done celebration dead code — React 18 batches the two state updates, so the completed task left the list before the `done` class could render. As executed, `openTasks` keeps the just-done task mounted while `justDoneId` matches (500ms), a `doneTimer` ref makes rapid completions race-safe, and the check button got `type="button"`. **Task 8 note:** the `openTasks` line must preserve this: `filter((t) => (!t.completedAt || t.id === justDoneId) && t.id !== oneThing?.id)`.

- **Task 6 (commit af5f3bb):** the plan's `update()` called `window.ollibeu.saveData` inside the `setData` updater — React updaters must be pure, and StrictMode double-invokes them in dev (double disk writes). As executed, persistence happens in a `useEffect` on `data` guarded by a `hydrated` ref (skips the initial-load echo write); the updater is pure. `update()`'s name and signature are unchanged, so Tasks 7–8 wire in exactly as written.
- **Task 5 (commit 6a82fd1):** the plan's original `loadData` swallowed ALL read errors into `emptyData()`, which could let a transient IO error plus autosave silently wipe real user data — contradicting the spec's "never silently delete anything." As executed, only ENOENT and corrupt JSON fall back to defaults; other read errors propagate. A test covers this (loadData on a directory path rejects).

## Self-Review Notes

- **Spec coverage (Phase 1 scope):** layout Option C ✓ (Tasks 6–9), themes + 6:30 auto-switch ✓ (Tasks 2, 6), importance edges ✓ (Tasks 6–7), just-one-thing with pin/shuffle ✓ (Tasks 3, 8), no-guilt copy ✓ (Global Constraints + component strings), win count ✓ (Tasks 4, 7), quotes ✓ (Task 4), local-first atomic storage + forward migration ✓ (Task 5), MIT ✓ (Task 9). Deferred by design: Google sync, leave-by, idle ding, onboarding, launch-at-login, gamification toggle UI, sounds, installers — Phases 2–3.
- **Type consistency:** `justDoneId` threaded App→TaskList; `TodayRail` takes only `night`; `update()` defined in Task 6 and consumed in 7–8; `AppState.activeTaskId` cleared on completion in Task 7's `completeTask` (checked before Task 8 introduces pinning — safe because the field is optional).
