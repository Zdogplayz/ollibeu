# Ollibeu Phase 3b: Onboarding + Release Pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** A gentle three-step first-run onboarding (name → connect Google → open at login), electron-builder packaging (mac dmg arm64+x64, windows nsis), GitHub Actions CI + tag-triggered release publishing, and a non-technical README install guide. Ends with tag `v0.1.0` producing downloadable installers.

**Architecture:** Onboarding is a renderer overlay gated on a new `Settings.onboarded` flag (default false — existing dev data will see onboarding once; acceptable and a useful test). Packaging via electron-builder driven by `electron-builder.yml`; releases publish from GitHub-hosted mac/windows runners on `v*` tags using the built-in GITHUB_TOKEN. Code signing deliberately absent (documented Gatekeeper/SmartScreen steps); signing later = repo secrets only.

## Global Constraints

- No-guilt copy throughout onboarding; every step skippable; nothing blocks the dashboard.
- `onboarded: boolean` joins Settings (DEFAULT false) — storage forward-migration covers old files.
- Unsigned builds: README MUST include the macOS right-click-Open path and Windows SmartScreen "More info → Run anyway" with screenshots-level clarity (text only).
- Packaged userData dirs (document exactly): macOS `~/Library/Application Support/Ollibeu`, Windows `%APPDATA%/Ollibeu`, Linux dev `~/.config/ollibeu`. The google-oauth.json goes in that dir.
- Custom app icon is a logged follow-up (default Electron icon ships in v0.1.0).
- Gates per commit: `npm run typecheck && npm test && npm run build` (106 baseline).
- Branch `feat/phase3b-onboarding-release` from main. Commit messages exact.

## File Structure

```
src/shared/types.ts                — + onboarded
src/renderer/src/components/Onboarding.tsx — NEW
src/renderer/src/App.tsx           — onboarding gate
src/renderer/src/theme.css         — onboarding styles
electron-builder.yml               — NEW
package.json                       — electron-builder devDep, dist scripts, author/homepage
.github/workflows/ci.yml           — NEW: typecheck+test on pushes/PRs
.github/workflows/release.yml      — NEW: mac+win builds on v* tags
README.md                          — full overhaul
```

---

### Task 1: Onboarding flow

**Files:** `src/shared/types.ts`, `src/renderer/src/components/Onboarding.tsx` (new), `src/renderer/src/App.tsx`, `src/renderer/src/theme.css`

- [ ] types.ts: add `onboarded: boolean` to Settings; `onboarded: false` in DEFAULT_SETTINGS.
- [ ] `Onboarding.tsx`:

```tsx
import { useState } from 'react'
import type { GoogleStatus, Settings } from '@shared/types'

export default function Onboarding(props: {
  settings: Settings
  google: GoogleStatus
  onChange: (patch: Partial<Settings>) => void
  onConnect: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(props.settings.displayName)

  const steps = [
    <div key="name" className="onboarding-step">
      <h2>Welcome to Ollibeu 🌿</h2>
      <p>A calm little home for your day. First — what should we call you?</p>
      <input
        type="text"
        autoFocus
        placeholder="your name (or skip — that’s fine too)"
        aria-label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') next()
        }}
      />
    </div>,
    <div key="google" className="onboarding-step">
      <h2>Bring your calendar along?</h2>
      <p>
        Connect Google and Ollibeu shows your appointments, gentle get-ready nudges, and your
        Google Tasks — all in one calm place. Totally optional.
      </p>
      {props.google.state === 'connected' ? (
        <p className="onboarding-good">Connected{props.google.email ? ` as ${props.google.email}` : ''} ✓</p>
      ) : props.google.state === 'connecting' ? (
        <p>A browser tab just opened — finish signing in there, then come back. 🌿</p>
      ) : props.google.state === 'unconfigured' ? (
        <p>Google isn’t set up on this build — you can add it later in settings. No worries.</p>
      ) : (
        <button type="button" className="pill-button" onClick={props.onConnect}>
          Connect Google
        </button>
      )}
    </div>,
    <div key="autostart" className="onboarding-step">
      <h2>Be there when you open your computer?</h2>
      <p>
        Ollibeu works best when it greets you at startup — your day is already laid out before
        distractions arrive.
      </p>
      <label className="onboarding-toggle">
        <input
          type="checkbox"
          checked={props.settings.launchAtLogin}
          onChange={(e) => props.onChange({ launchAtLogin: e.target.checked })}
        />
        <span>Open Ollibeu when the computer starts</span>
      </label>
    </div>
  ]

  function next(): void {
    if (step === 0 && name.trim() !== props.settings.displayName) {
      props.onChange({ displayName: name.trim() })
    }
    if (step < steps.length - 1) setStep(step + 1)
    else props.onDone()
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card card">
        {steps[step]}
        <div className="onboarding-nav">
          <div className="onboarding-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={i === step ? 'dot active' : 'dot'} />
            ))}
          </div>
          <div className="onboarding-buttons">
            {step > 0 && (
              <button type="button" className="pill-button quiet" onClick={() => setStep(step - 1)}>
                back
              </button>
            )}
            <button type="button" className="pill-button" onClick={next}>
              {step < steps.length - 1 ? 'next →' : 'let’s go 🌿'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] App.tsx: render the overlay INSTEAD of nothing when data loaded and `!data.settings.onboarded` (dashboard renders underneath; overlay sits on top):

```tsx
      {!data.settings.onboarded && (
        <Onboarding
          settings={data.settings}
          google={google}
          onChange={(patch) => void window.ollibeu.mutate.setSettings(patch)}
          onConnect={() => void window.ollibeu.google.connect().catch(() => {})}
          onDone={() => void window.ollibeu.mutate.setSettings({ onboarded: true })}
        />
      )}
```

(placed right after the SettingsPanel block; import Onboarding.)
- [ ] theme.css:

```css
.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: linear-gradient(160deg, var(--bg-a) 0%, var(--bg-b) 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 20;
}
.onboarding-card { width: 440px; max-width: 92vw; padding: 28px; text-align: center; }
.onboarding-step h2 { font-size: 22px; margin-bottom: 10px; }
.onboarding-step p { color: var(--text-soft); font-size: 14px; line-height: 1.6; margin-bottom: 14px; }
.onboarding-step input[type='text'] {
  width: 100%;
  border: 1px solid var(--card-border);
  background: var(--card-bg);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 14px;
  font-size: 15px;
  text-align: center;
}
.onboarding-good { color: var(--accent-soft); font-weight: 600; }
.onboarding-toggle { display: flex; gap: 10px; justify-content: center; align-items: center; font-size: 14px; }
.onboarding-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 22px; }
.onboarding-dots { display: flex; gap: 6px; }
.onboarding-dots .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--card-border); }
.onboarding-dots .dot.active { background: var(--accent); }
.onboarding-buttons { display: flex; gap: 8px; }
```

- [ ] Gates → commit `feat: gentle three-step onboarding`

---

### Task 2: electron-builder packaging

**Files:** `package.json`, `electron-builder.yml` (new)

- [ ] `npm install -D electron-builder@^24`
- [ ] package.json additions: `"author": "Zephyriah Spaar"`, `"homepage": "https://github.com/Zdogplayz/ollibeu"`, scripts:

```json
    "dist": "electron-vite build && electron-builder --publish never",
    "dist:dir": "electron-vite build && electron-builder --dir --publish never"
```

- [ ] `electron-builder.yml`:

```yaml
appId: app.ollibeu
productName: Ollibeu
directories:
  output: release
files:
  - out/**
  - package.json
mac:
  category: public.app-category.productivity
  target:
    - target: dmg
      arch: [arm64, x64]
win:
  target:
    - target: nsis
      arch: [x64]
nsis:
  oneClick: true
  deleteAppDataOnUninstall: false
linux:
  target:
    - target: dir
publish:
  provider: github
  owner: Zdogplayz
  repo: ollibeu
```

- [ ] Verify locally (WSL): `npm run dist:dir` — expect `release/linux-unpacked/ollibeu` to exist (Linux dir build proves the config + bundling).
- [ ] Add `release/` to .gitignore.
- [ ] Gates → commit `feat: electron-builder packaging config`

---

### Task 3: CI + release workflows + README

**Files:** `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `README.md`

- [ ] `ci.yml`:

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck
      - run: npm test
      - run: npm run build
```

- [ ] `release.yml`:

```yaml
name: Release
on:
  push:
    tags: ['v*']
permissions:
  contents: write
jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
          - os: windows-latest
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run typecheck && npm test
      - run: npx electron-vite build
      - run: npx electron-builder --publish always
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

- [ ] README.md full overhaul — sections: what Ollibeu is (calm, ADHD-first, one gentle paragraph); Download (link to Releases; per-OS install steps INCLUDING the unsigned-app dance: macOS "right-click the app → Open → Open" on first launch, Windows "More info → Run anyway"); What it does (bullets: just-one-thing, no-guilt list, importance edges, due times, confetti, day/night, Google Calendar + Tasks two-way, add events, idle nudge, settings); Connecting Google (creating the Cloud project OAuth client, enabling Calendar+Tasks APIs, where google-oauth.json lives per OS — exact paths from Global Constraints); Development (existing commands); MIT.
- [ ] Gates → commit `feat: CI and tag-driven release pipeline, install-ready README` → push branch.

---

### Task 4: Final review → merge → tag v0.1.0

- [ ] Whole-branch final review; fix wave if needed; merge to main; push.
- [ ] `git tag v0.1.0 && git push origin v0.1.0` — verify the Release workflow runs and artifacts (dmg ×2, exe) attach to the GitHub release.
