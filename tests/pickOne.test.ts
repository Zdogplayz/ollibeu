import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { pickOneThing } from '../src/shared/pickOne'

const NOW = new Date('2026-07-10T14:00:00')

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    importance: 'medium',
    source: 'local',
    createdAt: '2026-07-09T09:00:00',
    ...overrides
  }
}

describe('pickOneThing', () => {
  it('returns null for no tasks', () => {
    expect(pickOneThing([], NOW)).toBeNull()
  })

  it('prefers higher importance', () => {
    const tasks = [task({ id: 'a', importance: 'low' }), task({ id: 'b', importance: 'high' })]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('a looming due date beats plain high importance', () => {
    const tasks = [
      task({ id: 'a', importance: 'high' }),
      task({ id: 'b', importance: 'medium', dueDate: '2026-07-10' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('older tasks gently rise', () => {
    const tasks = [
      task({ id: 'a', createdAt: '2026-07-09T09:00:00' }),
      task({ id: 'b', createdAt: '2026-06-01T09:00:00' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('never picks completed or snoozed tasks', () => {
    const tasks = [
      task({ id: 'a', importance: 'high', completedAt: '2026-07-10T10:00:00' }),
      task({ id: 'b', importance: 'high', snoozedUntil: '2026-07-11T00:00:00' }),
      task({ id: 'c', importance: 'low' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('c')
  })

  it('a past snooze no longer excludes', () => {
    const tasks = [task({ id: 'a', snoozedUntil: '2026-07-10T09:00:00' })]
    expect(pickOneThing(tasks, NOW)?.id).toBe('a')
  })

  it('respects shuffle exclusions and returns null when all excluded', () => {
    const tasks = [task({ id: 'a' }), task({ id: 'b' })]
    expect(pickOneThing(tasks, NOW, ['a'])?.id).toBe('b')
    expect(pickOneThing(tasks, NOW, ['a', 'b'])).toBeNull()
  })

  it('ties break stably by id', () => {
    const tasks = [task({ id: 'z' }), task({ id: 'a' })]
    expect(pickOneThing(tasks, NOW)?.id).toBe('a')
    expect(pickOneThing([...tasks].reverse(), NOW)?.id).toBe('a')
  })

  it('a due time already passed today outranks one later today', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-07-10', dueTime: '16:00' }),
      task({ id: 'b', dueDate: '2026-07-10', dueTime: '09:00' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })

  it('dueTime absent falls back to end-of-day deadline', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-07-10' }),
      task({ id: 'b', dueDate: '2026-07-10', dueTime: '09:00' })
    ]
    expect(pickOneThing(tasks, NOW)?.id).toBe('b')
  })
})
