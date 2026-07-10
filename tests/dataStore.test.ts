import { mkdtemp, readFile, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DataStore } from '../src/main/dataStore'
import type { Task } from '../src/shared/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ollibeu-store-'))
})

function aTask(id: string): Task {
  return { id, title: id, importance: 'low', source: 'local', createdAt: '2026-07-10T09:00:00' }
}

describe('DataStore', () => {
  it('opens with defaults when no file exists and get() returns current state', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    expect(store.get().tasks).toEqual([])
    expect(store.get().settings.theme).toBe('auto')
  })

  it('mutate applies synchronously, notifies listeners, and persists', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    const seen: number[] = []
    store.onChange((d) => seen.push(d.tasks.length))
    await store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('a')] }))
    expect(store.get().tasks).toHaveLength(1)
    expect(seen).toEqual([1])
    expect(JSON.parse(await readFile(file, 'utf8')).tasks).toHaveLength(1)
  })

  it('serializes overlapping mutations in order', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    await Promise.all([
      store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('a')] })),
      store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('b')] }))
    ])
    const onDisk = JSON.parse(await readFile(file, 'utf8'))
    expect(onDisk.tasks.map((t: Task) => t.id)).toEqual(['a', 'b'])
  })

  it('unsubscribe stops notifications', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    const cb = vi.fn()
    const off = store.onChange(cb)
    off()
    await store.mutate((d) => d)
    expect(cb).not.toHaveBeenCalled()
  })

  it('fires saveTrouble true on failed save and false once saving recovers', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    const states: boolean[] = []
    store.onSaveTrouble((t) => states.push(t))
    // Make the save path fail: replace the data file's parent with an unwritable target
    // by pointing a second mutation at a directory-as-file path via the internal queue.
    // Simpler deterministic route: monkeypatch the store's save function.
    const anyStore = store as unknown as { save: (d: unknown) => Promise<void> }
    const realSave = anyStore.save.bind(store)
    anyStore.save = () => Promise.reject(new Error('disk full'))
    await store.mutate((d) => d) // fails to persist
    anyStore.save = realSave
    await store.mutate((d) => d) // recovers
    expect(states).toEqual([true, false])
  })

  it('open propagates unexpected read errors (no silent wipe)', async () => {
    await expect(DataStore.open(dir)).rejects.toThrow()
  })

  it('open survives corrupt JSON with defaults', async () => {
    const file = path.join(dir, 'data.json')
    await writeFile(file, '{nope', 'utf8')
    const store = await DataStore.open(file)
    expect(store.get().tasks).toEqual([])
  })

  it('a throwing onChange listener does not prevent the save or other listeners', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    const seen: number[] = []
    store.onChange(() => {
      throw new Error('bad listener')
    })
    store.onChange((d) => seen.push(d.tasks.length))
    await store.mutate((d) => ({ ...d, tasks: [...d.tasks, aTask('a')] }))
    expect(seen).toEqual([1])
    expect(JSON.parse(await readFile(file, 'utf8')).tasks).toHaveLength(1)
  })

  it('a throwing onSaveTrouble listener cannot fake a save failure', async () => {
    const file = path.join(dir, 'data.json')
    const store = await DataStore.open(file)
    const states: boolean[] = []
    store.onSaveTrouble((t) => {
      states.push(t)
      if (t === false) throw new Error('bad listener')
    })
    const anyStore = store as unknown as { save: (d: unknown) => Promise<void> }
    const realSave = anyStore.save.bind(store)
    anyStore.save = () => Promise.reject(new Error('disk full'))
    await store.mutate((d) => d)
    anyStore.save = realSave
    await store.mutate((d) => d)
    await store.mutate((d) => d)
    expect(states).toEqual([true, false])
  })
})
