# Ollibeu 🌿

Ollibeu is a calming desktop dashboard for ADHD brains. See your day, do one thing, no guilt. Ollibeu opens quietly with your computer, gives you one gentle suggestion for what to do next, and keeps the rest of your list soft and out of the way until you're ready for it. Nothing shouts at you, nothing turns red because you're "late" — it just waits with you. I hope it helps, O.

## Download

Grab the latest installer from [GitHub Releases](https://github.com/Zdogplayz/ollibeu/releases):

- **macOS** — `.dmg` (Apple Silicon and Intel)
- **Windows** — `.exe`

Ollibeu is free and open source, and the installers aren't signed yet, so your OS will ask you to vouch for it once. That's normal, and here's what you have to do:

**macOS:** On first launch, macOS will say the app can't be opened. Right-click (or Control-click) the app and choose **Open**, then confirm **Open** in the dialog. If that doesn't show an Open option, go to **System Settings → Privacy & Security** and click **Open Anyway** next to Ollibeu.

**Windows:** SmartScreen will pop up saying the app is unrecognized. Click **More info**, then **Run anyway**.

**If your Mac says the app is "damaged":** On Apple Silicon Macs, macOS sometimes refuses to open an unsigned app at all, saying it's "damaged and can't be opened — you should move it to the Trash." This looks alarming; it isn't. Ollibeu is fine, it just isn't signed yet, and Gatekeeper is being extra cautious. To recover, open **Terminal** and run:

```
xattr -d com.apple.quarantine /Applications/Ollibeu.app
```

Then open the app normally. It'll launch right up.

You only have to do this once per install.

## What it does

- **Opens with your computer** — no need to remember to launch it
- **"Just one thing"** — a single suggested task at a time, which you can pin, or give a gentle shuffle if it's not the right one right now
- **A no-guilt task list** — soft importance colors instead of urgency alarms, optional due dates and times, and past-due items that surface gently as "waiting" rather than "overdue"
- **A little celebration** — confetti and a soft chime when you finish something
- **Day and night calm themes** — switches automatically in the evening, so the app winds down when you do
- **Google Calendar, right there** — a Today rail with your events, get-ready nudges before they start, and the ability to add new events without leaving the app
- **Two-way Google Tasks sync** — keep working from wherever's comfortable; it stays in sync
- **An optional gentle idle nudge** — a soft check-in if you've drifted, entirely opt-in
- **A finished-tasks view** — so you can look back and see what you actually got done
- **Settings for all of it** — every one of the above can be adjusted or turned off

## Connecting Google

**If you installed Ollibeu from the Releases page, there's nothing to set up** — just click **Connect Google** (in onboarding or the Today panel), sign in in your browser, and Calendar + Tasks start syncing. It's optional; everything else works without it.

<details>
<summary>Building from source? You'll need your own Google keys</summary>

Release installers ship with the app's Google client keys baked in (injected at build time — desktop-app OAuth keys are non-confidential by design). A source build doesn't have them, so:

1. Create a project in the [Google Cloud Console](https://console.cloud.google.com/).
2. Enable the **Google Calendar API** and **Google Tasks API** for that project.
3. Set up the **OAuth consent screen**: choose **External**, and while the app is unpublished, add yourself (and anyone else who'll use it) as **test users**.
4. Create an **OAuth client ID** of type **Desktop app** — this gives you a Client ID and a Client secret.
5. Open Ollibeu and **paste the two keys when it asks** — during onboarding, in the Today panel, or under **Settings → Google**. The app stores them for you.
6. Click **Connect Google** and sign in.

</details>

<details>
<summary>Advanced: providing the keys as a file instead</summary>

Save them as `google-oauth.json` — `{ "clientId": "...", "clientSecret": "..." }` — in Ollibeu's data folder: macOS `~/Library/Application Support/ollibeu/`, Windows `%APPDATA%\ollibeu\`, Linux/dev `~/.config/ollibeu/`. Environment variables `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` also work and take precedence.

</details>

That's it — Calendar and Tasks will start syncing.

## Development

```bash
npm install
npm run dev        # launch the app with hot reload
npm test           # unit tests (Vitest)
npm run typecheck  # strict TS across main + renderer
npm run build      # production bundles
npm run dist       # packaged installer for your current OS
```

## License

MIT licensed.
