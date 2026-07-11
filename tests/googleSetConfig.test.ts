import { mkdtemp, readFile, stat } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => false,
    getSelectedStorageBackend: () => 'basic_text'
  },
  shell: { openExternal: vi.fn() }
}))

import { GoogleAuth } from '../src/main/google/auth'
import { loadGoogleConfig } from '../src/main/google/config'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ollibeu-gauth-'))
})

describe('GoogleAuth.setClientConfig', () => {
  it('moves an unconfigured build to disconnected and persists for the next launch', async () => {
    const auth = await GoogleAuth.create(dir)
    expect(auth.status().state).toBe('unconfigured')

    const status = await auth.setClientConfig({
      clientId: '  my-id.apps.googleusercontent.com  ',
      clientSecret: ' shh '
    })
    expect(status.state).toBe('disconnected')

    const onDisk = JSON.parse(await readFile(path.join(dir, 'google-oauth.json'), 'utf8'))
    expect(onDisk).toEqual({ clientId: 'my-id.apps.googleusercontent.com', clientSecret: 'shh' })
    if (process.platform !== 'win32') {
      // POSIX-only: Windows has no mode bits; %APPDATA% is per-user via ACLs
      const mode = (await stat(path.join(dir, 'google-oauth.json'))).mode & 0o777
      expect(mode).toBe(0o600)
    }

    // a fresh launch reads it back through the normal loader
    expect(await loadGoogleConfig({}, path.join(dir, 'google-oauth.json'))).toEqual(onDisk)
    const relaunched = await GoogleAuth.create(dir)
    expect(relaunched.status().state).toBe('disconnected')
  })

  it('re-entering keys over an existing world-readable file still ends at mode 0600', async () => {
    const p = path.join(dir, 'google-oauth.json')
    const { writeFile, chmod } = await import('fs/promises')
    await writeFile(p, JSON.stringify({ clientId: 'old' }), 'utf8')
    await chmod(p, 0o644)
    const auth = await GoogleAuth.create(dir)
    await auth.setClientConfig({ clientId: 'new-id' })
    if (process.platform !== 'win32') {
      const mode = (await stat(p)).mode & 0o777
      expect(mode).toBe(0o600)
    }
    expect(JSON.parse(await readFile(p, 'utf8')).clientId).toBe('new-id')
  })

  it('ignores an empty client id and stays unconfigured', async () => {
    const auth = await GoogleAuth.create(dir)
    const status = await auth.setClientConfig({ clientId: '   ' })
    expect(status.state).toBe('unconfigured')
  })

  it('clearClientConfig forgets saved keys and re-resolves (unconfigured without embedded)', async () => {
    const auth = await GoogleAuth.create(dir)
    await auth.setClientConfig({ clientId: 'typo-id' })
    expect(auth.status().state).toBe('disconnected')
    const status = await auth.clearClientConfig()
    expect(status.state).toBe('unconfigured')
    await expect(readFile(path.join(dir, 'google-oauth.json'), 'utf8')).rejects.toThrow()
  })

  it('notifies status listeners when the config lands', async () => {
    const auth = await GoogleAuth.create(dir)
    const seen: string[] = []
    auth.onStatusChange((s) => seen.push(s.state))
    await auth.setClientConfig({ clientId: 'cid' })
    expect(seen).toEqual(['disconnected'])
  })
})
