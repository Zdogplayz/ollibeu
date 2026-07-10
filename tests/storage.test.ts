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
