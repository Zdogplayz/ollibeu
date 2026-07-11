import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { mapGtaskDue, mergeGtasks, type RemoteGtask } from '../src/shared/gtasksMerge'

const NOW = '2026-07-10T14:00:00.000Z'

function local(overrides: Partial<Task> & { id: string }): Task {
  return { title: overrides.id, importance: 'medium', source: 'local', createdAt: '2026-07-01T09:00:00', ...overrides }
}

function gtaskRow(overrides: Partial<Task> & { id: string; gtasksId: string }): Task {
  return { ...local(overrides), source: 'gtasks', gtasksListId: 'L1', ...overrides }
}

function remote(overrides: Partial<RemoteGtask> & { id: string }): RemoteGtask {
  return { listId: 'L1', title: overrides.id, completed: false, ...overrides }
}

describe('mapGtaskDue', () => {
  it('normalizes RFC3339 to a plain date', () => {
    expect(mapGtaskDue('2026-07-15T00:00:00.000Z')).toBe('2026-07-15')
  })
  it('rejects garbage and calendar-invalid dates', () => {
    expect(mapGtaskDue('not-a-date')).toBeUndefined()
    expect(mapGtaskDue('2026-02-30T00:00:00.000Z')).toBeUndefined()
    expect(mapGtaskDue(undefined)).toBeUndefined()
    expect(mapGtaskDue(42)).toBeUndefined()
  })
})

describe('mergeGtasks', () => {
  it('leaves local-source tasks untouched', () => {
    const mine = local({ id: 'mine', importance: 'high' })
    const { tasks } = mergeGtasks([mine], [], NOW)
    expect(tasks).toEqual([mine])
  })

  it('imports new remote tasks', () => {
    const { tasks } = mergeGtasks([], [remote({ id: 'g1', title: 'Buy milk', due: '2026-07-15T00:00:00.000Z' })], NOW)
    expect(tasks).toHaveLength(1)
    expect(tasks[0]).toMatchObject({
      source: 'gtasks',
      gtasksId: 'g1',
      gtasksListId: 'L1',
      title: 'Buy milk',
      dueDate: '2026-07-15',
      importance: 'medium'
    })
  })

  it('does not import an already-completed remote task with no local counterpart', () => {
    const { tasks } = mergeGtasks([], [remote({ id: 'g1', title: 'Buy milk', completed: true })], NOW)
    expect(tasks).toEqual([])
  })

  it('first sync with only completed remotes imports none of them', () => {
    const { tasks } = mergeGtasks(
      [],
      [
        remote({ id: 'g1', title: 'One', completed: true }),
        remote({ id: 'g2', title: 'Two', completed: true }),
        remote({ id: 'g3', title: 'Three', completed: true })
      ],
      NOW
    )
    expect(tasks).toEqual([])
  })

  it('follows remote title/due changes and remote completion', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', title: 'Old', dueDate: '2026-07-14' })
    const { tasks } = mergeGtasks([row], [remote({ id: 'g1', title: 'New', due: '2026-07-16T00:00:00.000Z', completed: true })], NOW)
    expect(tasks[0]).toMatchObject({ id: 't1', title: 'New', dueDate: '2026-07-16', completedAt: NOW })
  })

  it('does not overwrite an existing completedAt on repeat syncs', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', completedAt: '2026-07-09T08:00:00' })
    const { tasks } = mergeGtasks([row], [remote({ id: 'g1', completed: true })], NOW)
    expect(tasks[0].completedAt).toBe('2026-07-09T08:00:00')
  })

  it('queues locally-completed pending rows for upload and keeps them', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', completedAt: NOW, gtasksSyncPending: true })
    const { tasks, toComplete } = mergeGtasks([row], [remote({ id: 'g1' })], NOW)
    expect(toComplete).toEqual([{ listId: 'L1', taskId: 'g1' }])
    expect(tasks[0]).toMatchObject({ id: 't1', gtasksSyncPending: true, completedAt: NOW })
  })

  it('removes gtasks rows that vanished remotely, unless upload-pending', () => {
    const gone = gtaskRow({ id: 't1', gtasksId: 'g1' })
    const pending = gtaskRow({ id: 't2', gtasksId: 'g2', completedAt: NOW, gtasksSyncPending: true })
    const { tasks } = mergeGtasks([gone, pending], [], NOW)
    expect(tasks.map((t) => t.id)).toEqual(['t2'])
  })

  it('keeps a vanished-remotely row when skipDeletions is set (truncated snapshot)', () => {
    const gone = gtaskRow({ id: 't1', gtasksId: 'g1' })
    const { tasks } = mergeGtasks([gone], [], NOW, { skipDeletions: true })
    expect(tasks.map((t) => t.id)).toEqual(['t1'])
  })

  it('never queues a pending row that lacks a listId', () => {
    const row = { ...gtaskRow({ id: 't1', gtasksId: 'g1', completedAt: NOW, gtasksSyncPending: true }), gtasksListId: undefined }
    const { tasks, toComplete } = mergeGtasks([row], [], NOW)
    expect(toComplete).toEqual([])
    expect(tasks.map((t) => t.id)).toEqual(['t1'])
  })

  it('matches remote tasks by list AND id, not id alone', () => {
    const row = gtaskRow({ id: 't1', gtasksId: 'g1', gtasksListId: 'L1', title: 'Mine' })
    const otherList = remote({ id: 'g1', listId: 'L2', title: 'Other list' })
    const { tasks } = mergeGtasks([row], [otherList], NOW)
    const mirrored = tasks.find((t) => t.gtasksListId === 'L2')
    expect(mirrored).toBeDefined()
    expect(tasks.find((t) => t.id === 't1')).toBeUndefined()
  })
})
