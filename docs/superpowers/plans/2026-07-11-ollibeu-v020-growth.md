# Ollibeu v0.2.0: Recurring Tasks, Snooze, Quick Capture, Garden, Icon, Auto-Update

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Tier 1+2 of the roadmap, free-path only (code signing deferred): recurring tasks (daily/weekly/monthly), "not today" snooze, a global quick-capture hotkey, the never-wilting garden, a real app icon, and auto-update (silent on Windows; gentle download-link flow on unsigned macOS/Linux).

**Architecture:** Recurrence and snooze are pure shared logic (TDD) applied in main's `task:complete`/new `task:snooze`. Quick capture is a second tiny renderer entry in a frameless always-on-top window summoned by a global shortcut. The garden derives entirely from completed-task history (no new persisted state beyond a `gardenEnabled` setting). Auto-update: `electron-updater` full-silent on win32; elsewhere a lightweight GitHub-latest-version check surfaces a gentle link.

## Global Constraints

- No-guilt copy everywhere. Recurrence must never resurrect guilt: completing a recurring task celebrates normally and the next occurrence is dated FORWARD from today (never stacking "missed" copies).
- New Settings keys (all covered by the storage default-merge): `gardenEnabled: boolean` (default true — supersedes the never-used `gamificationEnabled`, which stays in the type but is no longer surfaced), `quickCaptureEnabled: boolean` (default true).
- New Task field: `repeat?: 'daily' | 'weekly' | 'monthly'` — local-source tasks only (AddTask offers it only when a due date is set; sync never writes it).
- Snooze: `snoozedUntil` = start of the next local day; snoozed tasks leave the list and the picker (picker already honors it) and return automatically.
- Quick capture shortcut: `CommandOrControl+Shift+O`; registration failure is non-fatal (log once); unregistered on quit; toggleable in settings.
- Auto-update: win32 only via electron-updater (`autoDownload` on, install on quit; check at launch + every 4h); mac/linux check `https://api.github.com/repos/Zdogplayz/ollibeu/releases/latest` (unauthenticated, tolerate failures silently) and surface "a newer Ollibeu is ready" + link in the Settings panel; NEVER a blocking prompt.
- Icon: generated `build/icon.png` (1024²) from an inline SVG via a committed script (`sharp` devDependency); electron-builder auto-derives icns/ico. The PNG is committed.
- Gates per commit: `npm run typecheck && npm test && npm run build` (114 baseline).
- Branch `feat/v020-growth`. Commit messages exact. Version bump to 0.2.0 happens in the final task.

## File Structure

```
src/shared/types.ts            — repeat field; gardenEnabled/quickCaptureEnabled
src/shared/recurrence.ts       — NEW: nextOccurrence, completeRecurring, snoozeUntilTomorrow (pure, TDD)
src/main/index.ts              — recurring-aware task:complete; task:snooze; quick-capture window+shortcut; updater wiring
src/main/updater.ts            — NEW: setupAutoUpdate(win32) / checkLatestVersion(other)
src/preload/index.ts           — snoozeTask; onUpdateHint; captureAdd (reuses task:add)
src/renderer/src/global.d.ts
src/renderer/capture.html      — NEW second entry
src/renderer/src/capture.tsx   — NEW tiny capture UI
src/renderer/src/components/AddTask.tsx   — repeat select (needs date)
src/renderer/src/components/TaskList.tsx  — ↻ marker; "not today 🌙" action
src/renderer/src/components/GardenPanel.tsx — NEW
src/renderer/src/components/SettingsPanel.tsx — garden/quick-capture toggles; update hint row
src/renderer/src/App.tsx       — snoozed filter + resting line; garden link + panel
electron.vite.config.ts        — second renderer input
scripts/make-icon.mjs          — NEW icon generator
electron-builder.yml           — (no change needed: build/ is the default buildResources)
tests/recurrence.test.ts       — NEW
```

---

### Task 1: Recurrence + snooze pure logic (TDD)

**Files:** `src/shared/types.ts`, `src/shared/recurrence.ts` (new), `tests/recurrence.test.ts` (new)

**Interfaces:**
- types.ts: `repeat?: 'daily' | 'weekly' | 'monthly'` on Task; `gardenEnabled: boolean` + `quickCaptureEnabled: boolean` on Settings (+ defaults `true`, `true`).
- recurrence.ts:
  - `nextOccurrence(dueDate: string, repeat: 'daily'|'weekly'|'monthly', today: string): string` — always strictly AFTER `today`: daily → today+1; weekly → the next date after today whose weekday matches dueDate's weekday; monthly → dueDate's day-of-month in the next month strictly after today (clamped to month length, e.g. Jan 31 → Feb 28).
  - `completeRecurring(task: Task, completedAtIso: string, newId: string): { done: Task; next: Task }` — `done` = a completed copy (id `newId`, completedAt set, repeat REMOVED — history rows never respawn); `next` = the original task (same id) with `dueDate = nextOccurrence(...)`, `completedAt`/`snoozedUntil`/`gtasksSyncPending` cleared. `today` derives from completedAtIso's local date.
  - `snoozeUntilTomorrow(now: Date): string` — ISO datetime of the start of the next local day.

- [ ] Write failing tests (exact):

```ts
import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { completeRecurring, nextOccurrence, snoozeUntilTomorrow } from '../src/shared/recurrence'

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    importance: 'medium',
    source: 'local',
    createdAt: '2026-07-01T09:00:00',
    ...overrides
  }
}

describe('nextOccurrence', () => {
  it('daily is always tomorrow relative to today', () => {
    expect(nextOccurrence('2026-07-11', 'daily', '2026-07-11')).toBe('2026-07-12')
    // even when the task sat overdue for days, no stacking — just tomorrow
    expect(nextOccurrence('2026-07-01', 'daily', '2026-07-11')).toBe('2026-07-12')
  })
  it('weekly lands on the same weekday, strictly after today', () => {
    // 2026-07-11 is a Saturday
    expect(nextOccurrence('2026-07-11', 'weekly', '2026-07-11')).toBe('2026-07-18')
    // overdue weekly (was Wed 07-08, today Sat 07-11) → next Wed
    expect(nextOccurrence('2026-07-08', 'weekly', '2026-07-11')).toBe('2026-07-15')
  })
  it('monthly keeps the day-of-month, clamped to short months', () => {
    expect(nextOccurrence('2026-07-11', 'monthly', '2026-07-11')).toBe('2026-08-11')
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28')
    // overdue monthly (was 06-15, today 07-11) → 07-15 (this month, still ahead)
    expect(nextOccurrence('2026-06-15', 'monthly', '2026-07-11')).toBe('2026-07-15')
  })
})

describe('completeRecurring', () => {
  it('splits into a completed history copy and a forward-dated original', () => {
    const t = task({ id: 'meds', dueDate: '2026-07-11', dueTime: '09:00', repeat: 'daily' })
    const { done, next } = completeRecurring(t, '2026-07-11T09:05:00', 'copy-1')
    expect(done).toMatchObject({ id: 'copy-1', completedAt: '2026-07-11T09:05:00', title: 'meds' })
    expect(done.repeat).toBeUndefined()
    expect(next).toMatchObject({ id: 'meds', dueDate: '2026-07-12', dueTime: '09:00', repeat: 'daily' })
    expect(next.completedAt).toBeUndefined()
    expect(next.snoozedUntil).toBeUndefined()
  })
})

describe('snoozeUntilTomorrow', () => {
  it('is the very start of the next local day', () => {
    const iso = snoozeUntilTomorrow(new Date(2026, 6, 11, 14, 30))
    const parsed = new Date(iso)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
  })
})
```

- [ ] RED → implement (date math on local dates via `new Date(d + 'T00:00:00')` + get/set, formatted back with padStart; clamping via `Math.min(day, daysInMonth)`) → GREEN → gates (expect 121) → commit `feat: recurrence and snooze logic`

---

### Task 2: Recurring + snooze wiring

**Files:** `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`, `src/renderer/src/components/AddTask.tsx`, `src/renderer/src/components/TaskList.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

- main `task:complete`: when the completed task has `repeat` (and is local-source), apply `completeRecurring` (newId via `randomUUID` from node:crypto) — replace the row with `next` and append `done`; non-recurring path unchanged. Import from `../shared/recurrence`.
- new `task:snooze` handler: `(id, untilIso)` sets `snoozedUntil`, and clears the pin if that task was pinned. Preload `mutate.snoozeTask(id, untilIso)`; mirror types.
- AddTask: a `repeat` select (`no repeat` / `daily` / `weekly` / `monthly`) enabled only when a date is set (cleared when date clears, like time); passes through `onAdd` (extend signature + App's addTask to store it only when set).
- TaskList: recurring rows show `↻` inside the due chip (before the label); every open row gets a quiet "not today 🌙" hover-revealed button (`.snooze-button`; always visible at reduced opacity is fine — simpler and touch-friendly: `opacity .45`, 1 on hover) calling `onSnooze(t.id)`.
- App: `onSnooze` = `mutate.snoozeTask(id, snoozeUntilTomorrow(new Date()))`; `openTasks` filter also drops `t.snoozedUntil && new Date(t.snoozedUntil) > now`; under the list, when any tasks are resting: `<p className="resting-line">N resting until tomorrow 🌙</p>`.
- Copy rule: "not today" never shows how many times something was snoozed.
- Gates (121 stay green) → commit `feat: recurring tasks and not-today snooze`

---

### Task 3: Quick capture

**Files:** `electron.vite.config.ts`, `src/renderer/capture.html` (new), `src/renderer/src/capture.tsx` (new), `src/main/index.ts`, `src/renderer/src/components/SettingsPanel.tsx`, `src/renderer/src/App.tsx` (pass-through props), `src/renderer/src/theme.css`

- electron.vite renderer config gains `build: { rollupOptions: { input: { index: resolve(__dirname, 'src/renderer/index.html'), capture: resolve(__dirname, 'src/renderer/capture.html') } } }`.
- capture.html mirrors index.html but mounts `/src/capture.tsx` with title "Quick thought".
- capture.tsx: minimal — themed input in a `.capture-box`; Enter with non-empty text → `window.ollibeu.mutate.addTask({...medium local task, id: crypto.randomUUID(), createdAt: now})` then `window.close()`; Escape → `window.close()`. (The preload API already exposes addTask; same preload is used.)
- main: `let captureWin: BrowserWindow | null`; `openCapture()` creates (or focuses) a frameless, always-on-top, 420×88, transparent:false, resizable:false, skipTaskbar window loading `capture.html` (dev: `${ELECTRON_RENDERER_URL}/capture.html`); closes on blur. Register `globalShortcut.register('CommandOrControl+Shift+O', openCapture)` when `settings.quickCaptureEnabled`, re-evaluated on store change (register/unregister on transitions); `app.on('will-quit', () => globalShortcut.unregisterAll())`. Registration failure → one console.warn, never fatal.
- Settings row: "Quick capture (Ctrl/Cmd+Shift+O)" checkbox → `quickCaptureEnabled`.
- Gates → commit `feat: global quick-capture hotkey`

---

### Task 4: Garden 🌱

**Files:** `src/renderer/src/components/GardenPanel.tsx` (new), `src/renderer/src/App.tsx`, `src/renderer/src/components/SettingsPanel.tsx`, `src/renderer/src/theme.css`

- GardenPanel: overlay panel (same pattern as SettingsPanel — backdrop click + Escape close, aria-modal). Content: header "Your garden"; a grid where EVERY completed task ever is one plant — variety cycles deterministically `['🌱','🌿','🍀','🪴','🌷','🌸','🌻','🌳'][i % 8]`; render cap 240 plants with a `+N more in bloom` line; footer count copy: `N things have grown here — nothing ever wilts. 🌱` (singular-aware). Empty state: `Your garden is waiting for its first sprout — finish any little thing. 🌱`
- Plants derive from `data.tasks.filter(t => t.completedAt).length` — order by completedAt so the garden grows at the end.
- App: `const [gardenOpen, setGardenOpen] = useState(false)`; a `garden 🌱` link-button joins the win-line row (before "see finished"), shown only when `settings.gardenEnabled`; renders the panel when open.
- Settings row: "Garden 🌱" checkbox → `gardenEnabled`.
- CSS: `.garden-grid { display: flex; flex-wrap: wrap; gap: 6px; font-size: 22px; max-height: 300px; overflow-y: auto; }` + gentle `garden-pop` scale-in on the last plant only, reduced-motion guarded.
- Gates → commit `feat: the garden — every finished thing grows, nothing wilts`

---

### Task 5: App icon

**Files:** `scripts/make-icon.mjs` (new), `build/icon.png` (generated + committed), `package.json` (sharp devDep + `icon` script)

- `npm i -D sharp`
- Script renders this inline SVG at 1024²: rounded-square sage gradient background (`#f2f5ef→#a4c4ae`, radius 22%), centered dark-green leaf: a simple two-lobe leaf path with a stem and a lighter mid-vein (accent `#2b4038` leaf on light bg, vein `#8fc4a4`). Keep the SVG hand-written in the script; `sharp(Buffer.from(svg)).png().toFile('build/icon.png')`.
- Run it; verify `build/icon.png` exists and is 1024×1024 (`sharp` metadata or `file`); electron-builder picks up `build/icon.png` automatically for win/mac.
- `npm run dist:dir` still succeeds.
- Gates → commit `feat: Ollibeu leaf icon`

---

### Task 6: Auto-update

**Files:** `src/main/updater.ts` (new), `src/main/index.ts`, `src/preload/index.ts`, `src/renderer/src/global.d.ts`, `src/renderer/src/components/SettingsPanel.tsx`, `package.json` (electron-updater dep)

- `npm i electron-updater` (runtime dep — note: electron-builder bundles it via asar since files includes node_modules? NO — our files list is `out/** + package.json` only! electron-updater must be BUNDLED by electron-vite into out/main (vite bundles node deps by default unless externalized; electron-vite externalizes deps listed in `dependencies` via externalizeDepsPlugin? We never added that plugin — check the config; plain config means vite bundles imports. electron-updater is CJS with dynamic requires — bundling risk. SAFEST: keep electron-updater in dependencies AND extend electron-builder `files` to include `node_modules/**` — bloats asar. Alternative: add to files: `node_modules/electron-updater/**` + its deps tree (many). Simplest robust: let electron-vite bundle it (`import { autoUpdater } from 'electron-updater'`) — electron-vite by default DOES bundle non-external deps into out/main; electron-updater is known to bundle OK with vite when `builder-util-runtime` etc. resolve. The implementer must verify `npm run dist:dir` output launches conceptually — at minimum that out/main/index.js contains no bare `require('electron-updater')`. If bundling fails, fall back to adding `node_modules/**` patterns for electron-updater's dependency closure to electron-builder files and externalizing it. Document which path was taken.)
- updater.ts:

```ts
import { app } from 'electron'

const RELEASES_LATEST = 'https://api.github.com/repos/Zdogplayz/ollibeu/releases/latest'
const CHECK_MS = 4 * 60 * 60_000

export type UpdateHint = { available: false } | { available: true; version: string; url: string }

export function startUpdateFlow(onHint: (h: UpdateHint) => void): void {
  if (!app.isPackaged) return
  if (process.platform === 'win32') {
    void (async () => {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('update-downloaded', (info) =>
        onHint({ available: true, version: info.version, url: '' })
      )
      autoUpdater.on('error', (err) => console.warn('[ollibeu] update check skipped', err?.message))
      const check = (): void => void autoUpdater.checkForUpdates().catch(() => undefined)
      check()
      setInterval(check, CHECK_MS)
    })()
    return
  }
  // unsigned mac/linux: gentle manual flow
  const check = async (): Promise<void> => {
    try {
      const res = await fetch(RELEASES_LATEST, { headers: { Accept: 'application/vnd.github+json' } })
      if (!res.ok) return
      const body = (await res.json()) as { tag_name?: string; html_url?: string }
      const latest = (body.tag_name ?? '').replace(/^v/, '')
      if (latest && latest !== app.getVersion() && body.html_url) {
        onHint({ available: true, version: latest, url: body.html_url })
      }
    } catch {
      // quiet — update hints are a nicety
    }
  }
  void check()
  setInterval(() => void check(), CHECK_MS)
}
```

  (Note: `latest !== current` is naive ordering but safe — the repo only moves forward; document as such.)
- main: `startUpdateFlow((h) => broadcast('update:hint', h))`, placed in the success branch; also cache last hint and answer `update:get-hint` invoke for late renderers.
- preload/global.d.ts: `onUpdateHint(cb)`, `getUpdateHint(): Promise<UpdateHint>` (UpdateHint type exported from shared/types to avoid main-type imports in renderer — move the type there).
- SettingsPanel: a quiet "Updates" row: current version (pass `appVersion` prop — expose via preload `getVersion` invoke or embed `process.env.npm_package_version`? Cleanest: `update:get-hint` response includes `current: string`. Implementer's choice, document); when hint.available: win32 copy `A fresh Ollibeu is ready — it installs next time you open the app. ✨`; otherwise link `Ollibeu {version} is ready — download it` opening the release url via a new `shell:open-release` invoke that calls `shell.openExternal(url)` ONLY for urls beginning `https://github.com/Zdogplayz/ollibeu/` (validate in main).
- Gates → commit `feat: auto-update — silent on Windows, gentle elsewhere`

---

### Task 7: Final review → merge → v0.2.0

- Whole-branch final review (most capable model), fix wave, merge to main, `npm version 0.2.0`, tag `v0.2.0`, watch the release build, verify assets.
