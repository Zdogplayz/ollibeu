import { app } from 'electron'
import type { UpdateHint } from '../shared/types'

const RELEASES_LATEST = 'https://api.github.com/repos/Zdogplayz/ollibeu/releases/latest'
const CHECK_MS = 4 * 60 * 60_000

export function startUpdateFlow(onHint: (h: UpdateHint) => void): void {
  if (!app.isPackaged) return
  if (process.platform === 'win32') {
    void (async () => {
      const { autoUpdater } = await import('electron-updater')
      autoUpdater.autoDownload = true
      autoUpdater.autoInstallOnAppQuit = true
      autoUpdater.on('update-downloaded', (info) =>
        onHint({ available: true, current: app.getVersion(), version: info.version, url: '' })
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
      // "latest !== current" is naive ordering, not semver comparison — but
      // safe here since the repo only ever moves forward.
      if (latest && latest !== app.getVersion() && body.html_url) {
        onHint({ available: true, current: app.getVersion(), version: latest, url: body.html_url })
      }
    } catch {
      // quiet — update hints are a nicety
    }
  }
  void check()
  setInterval(() => void check(), CHECK_MS)
}
