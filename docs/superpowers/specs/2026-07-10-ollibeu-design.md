# Ollibeu — Design Spec

**Date:** 2026-07-10
**Status:** Approved pending user review
**One-liner:** A free, calming desktop dashboard for ADHD brains that opens with the computer and shows everything that matters today — without guilt.

## Purpose & audience

Ollibeu is built first for one specific non-technical Mac user whose life runs on Google Workspace, and secondarily for the developer (Windows) and, later, anyone who wants to download it. Success for v1: she opens her laptop, Ollibeu is already there, and within two seconds she knows (a) the one thing worth doing next, (b) the shape of her day, and (c) that nothing is on fire. The app must never guilt, alarm, or clutter.

## Platform decision

**Electron desktop app** (not a browser homepage). Reasons: system-wide idle detection, launch-at-login registration, native notifications, and a double-click install for non-technical users — none of which a hosted web page can do. The UI is web tech internally, so a hosted companion version remains possible later.

- **Stack:** Electron + TypeScript. Renderer: React + Vite (via electron-vite). Main process: window management, launch-at-login, idle watcher, notifications, Google OAuth + sync, local storage. Preload bridge with context isolation on; renderer talks to main only through typed IPC channels.
- **Targets:** macOS (Apple Silicon + Intel; primary test target — her machine) and Windows 10/11 (developer's machine). Built and released via GitHub Actions.
- **Storage:** local-first JSON (`electron-store` or equivalent) in the OS userData dir. No app server ever. Fully functional offline.

## Visual design (validated via mockups)

- **Theme — "Sage Day":** light, airy canvas (`#f2f5ef → #e6ede3` gradient), white cards with soft shadows, forest-green accents (`#5d8a6e` family), warm gold and soft terracotta as secondary accents.
- **Theme — "Forest Night":** deep mossy dark (`#16211c → #22332a`), same structure, dimmer, softer copy. **Auto-switches at 6:30pm** (and back at sunrise-ish, default 6:30am); user-overridable in settings.
- **Task importance coloring:** each task card carries a soft left edge — muted red `#dc9a8e` (important) / amber `#d7bd7e` (medium) / green `#8fbf9e` (whenever). Deliberately muted: urgency must never look like an alarm.
- **Layout — "Option C" (Focus Column + Today rail):**
  - Centered greeting with date/time, first name, time-of-day emoji, and a rotating gentle quote.
  - **"Just one thing" card** — the suggested next task, with a "~N minutes, and it's off your mind" estimate line and an **"I'll do this one →"** button.
  - Task list below, titled **"The rest — no rush."** Plus an "+ add something" affordance.
  - **Today rail** (right side, visually lighter semi-transparent panel): vertical timeline of today's calendar events with "now" marker, "leave by H:MM" cues, and a "Tomorrow: …" peek line.
- Reference mockups preserved in `.superpowers/brainstorm/` (gitignored; final HTML/CSS re-implements them properly).

## Data model

```
Task {
  id, title,
  importance: high | medium | low,
  source: local | gtasks,
  gtasksId?, gtasksListId?,
  dueDate?, estimateMinutes?,
  createdAt, completedAt?, snoozedUntil?
}
Settings {
  displayName,
  theme: auto | day | night,  nightStartsAt (default 18:30), dayStartsAt (default 06:30),
  idleDing: { enabled (default false), thresholdMinutes (default 10) },
  gamification: { enabled (default false) },
  quotes: { enabled (default true) },
  leaveByBufferMinutes (default 25),
  launchAtLogin (default true, set during onboarding)
}
CalendarCache { events for today + tomorrow, lastSyncedAt }
GoogleAuth { tokens, encrypted at rest via safeStorage }
```

## Google integration

- **OAuth 2.0** installed-app loopback flow with PKCE, opened in the system browser during onboarding. Skippable — the app is fully usable with local tasks only.
- **Scopes:** `calendar.readonly` (display only, never modify) and Google Tasks read/write.
- **Sync:** background poll every ~5 minutes plus on wake/unlock. Calendar events → Today rail. Google Tasks ↔ task list two-way: completing in Ollibeu completes in Google; new Google tasks appear in Ollibeu. Local and Google tasks coexist, distinguished by `source`.
- **Known caveat:** until Google verification (a later, for-profit-stage step), sign-in shows an "unverified app" interstitial once. Acceptable for v1's assisted setup. The Google Cloud OAuth app runs in production mode so refresh tokens do not expire weekly.

## ADHD feature behavior

1. **Just One Thing:** heuristic scoring by importance, due date proximity, task age, and time of day; ties broken stably. "Not this one" shuffle re-picks with no penalty or record of refusal. "I'll do this one →" marks the task active and (v1) simply keeps it pinned; no timers pressuring the user.
2. **Gentle time awareness:** next-event countdown framing ("Dentist in 90 min"), "leave by" = event start − `leaveByBufferMinutes`, "your evening is free" / "nothing before 10am tomorrow" reassurance lines.
3. **No-guilt task list:** no overdue badges, no red counts, no "3 days late." Missed tasks quietly remain. Completions celebrate: small animation + soft sound + "N things today ✨."
4. **Idle ding (opt-in):** when enabled, if system-wide input idle exceeds threshold during day hours, play a soft chime + notification ("Still with me? What were you working on?"). Never fires during night mode. Snoozes itself after firing (no nag loops).
5. **Evening mode copy:** after 6:30pm the dashboard shifts tone — "Winding down," "If you're up for one more," "Rest is productive too."
6. **Gamification (opt-in, default off):** v1 = gentle daily/weekly win counts only. No streaks, no loss states. (v1.1 idea, out of scope: a garden that grows one plant per completed task and never wilts.)

## Onboarding (first run)

Three friendly steps, skippable throughout: (1) "What should we call you?" (2) "Connect Google?" (3) "Open Ollibeu when your computer starts?" (default yes). Then the dashboard.

## Distribution

- **Public GitHub repo** under the zj44derp44 account, **MIT license**.
- **GitHub Actions:** on version tag, macOS runner builds `.dmg` (arm64 + x64) and Windows runner builds NSIS `.exe`; artifacts attach to a GitHub Release.
- **Unsigned for v1** (built for one known user); README includes illustrated non-technical install steps including macOS right-click-Open for Gatekeeper and Windows SmartScreen "More info → Run anyway." Signing later = repo secrets + CI config only, no restructuring.

## Error handling

- Offline / API failure: render from cache, quiet "last synced N min ago" hint; never a blocking error state.
- Google token invalid/revoked: gentle "Reconnect Google when you're ready" card; local tasks unaffected.
- Sync conflicts: last-write-wins; deletions never propagate silently to local data.
- Idle watcher and sync failures degrade silently to a working local dashboard — the dashboard must never be scarier than a paper to-do list.

## Testing

- **Unit (Vitest):** task-picker heuristic, theme scheduler (6:30 boundary, overrides, midnight edge), sync merge logic (two-way tasks, conflict cases), leave-by computation.
- **Manual smoke per release:** onboarding, Google connect, task CRUD + check-off sync, idle ding, theme switch, launch-at-login — on macOS (primary) and Windows.
- E2E (Playwright for Electron) deferred until after v1.

## Out of scope for v1

Google verification & code signing (deferred by decision), garden gamification, hosted web version, external task services beyond Google Tasks, mobile.
