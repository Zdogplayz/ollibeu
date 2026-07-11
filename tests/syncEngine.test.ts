import { mkdtemp } from 'fs/promises'
import { tmpdir } from 'os'
import path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ powerMonitor: { on: vi.fn(), removeListener: vi.fn() } }))

import { DataStore } from '../src/main/dataStore'
import { SyncEngine } from '../src/main/google/sync'
import type { GoogleApi } from '../src/main/google/api'
import type { GoogleAuth } from '../src/main/google/auth'
import type { Task } from '../src/shared/types'

let dir: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'ollibeu-sync-'))
})

const auth = {
  status: () => ({ state: 'connected' as const }),
  onStatusChange: () => () => {},
  getAccessToken: async () => 'tok'
} as unknown as GoogleAuth

function localTask(id: string): Task {
  return { id, title: id, importance: 'low', source: 'local', createdAt: '2026-07-10T09:00:00' }
}

function pendingGtaskRow(id: string, listId: string, gid: string): Task {
  return {
    id,
    title: id,
    importance: 'medium',
    source: 'gtasks',
    gtasksId: gid,
    gtasksListId: listId,
    createdAt: '2026-07-01T09:00:00',
    completedAt: '2026-07-10T13:00:00',
    gtasksSyncPending: true
  }
}

describe('SyncEngine.syncNow', () => {
  it('does not drop a task added while the sync is in flight', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    // A pending gtasks completion gives the upload loop something to await, which is
    // the actual in-flight window in the current implementation (merge happens right
    // after the initial fetches, then the code awaits the per-item completion PATCH
    // calls before the final store.mutate — a task landing during that PATCH await is
    // the case this test targets).
    await store.mutate((d) => ({ ...d, tasks: [pendingGtaskRow('a', 'L1', 'g1')] }))
    const api = {
      listEvents: async () => [],
      listAllTasks: async () => ({ tasks: [], complete: true }),
      patchTaskCompleted: async () => {
        // a local add lands while the completion upload is "in flight"
        await store.mutate((d) => ({ ...d, tasks: [...d.tasks, localTask('late-arrival')] }))
      }
    } as unknown as GoogleApi
    const engine = new SyncEngine(store, auth, api)
    await engine.syncNow()
    expect(store.get().tasks.map((t) => t.id)).toContain('late-arrival')
    expect(store.get().calendar?.lastSyncedAt).toBeTruthy()
  })

  it('clears pending only for the exact list:id whose upload succeeded', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    await store.mutate((d) => ({
      ...d,
      tasks: [pendingGtaskRow('a', 'L1', 'g1'), pendingGtaskRow('b', 'L2', 'g1')]
    }))
    const api = {
      listEvents: async () => [],
      listAllTasks: async () => ({ tasks: [], complete: true }),
      patchTaskCompleted: async (listId: string) => {
        if (listId === 'L2') throw new Error('google-api:500')
      }
    } as unknown as GoogleApi
    const engine = new SyncEngine(store, auth, api)
    await engine.syncNow()
    const tasks = store.get().tasks
    expect(tasks.find((t) => t.id === 'a')?.gtasksSyncPending).toBeFalsy()
    expect(tasks.find((t) => t.id === 'b')?.gtasksSyncPending).toBe(true)
  })

  it('clears pending when the completion upload fails with a terminal 404 (task gone in Google)', async () => {
    const store = await DataStore.open(path.join(dir, 'data.json'))
    await store.mutate((d) => ({ ...d, tasks: [pendingGtaskRow('a', 'L1', 'g1')] }))
    const api = {
      listEvents: async () => [],
      listAllTasks: async () => ({ tasks: [], complete: true }),
      patchTaskCompleted: async () => {
        throw new Error('google-api:404')
      }
    } as unknown as GoogleApi
    const engine = new SyncEngine(store, auth, api)
    await engine.syncNow()
    const tasks = store.get().tasks
    expect(tasks.find((t) => t.id === 'a')?.gtasksSyncPending).toBeFalsy()
  })
})
