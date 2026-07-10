import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { sortTasks } from '../src/shared/taskSort'

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    importance: 'medium',
    source: 'local',
    createdAt: '2026-07-09T09:00:00',
    ...overrides
  }
}

describe('sortTasks importance mode', () => {
  it('orders high before medium before low', () => {
    const tasks = [
      task({ id: 'a', importance: 'low' }),
      task({ id: 'b', importance: 'high' }),
      task({ id: 'c', importance: 'medium' })
    ]
    expect(sortTasks(tasks, 'importance').map((t) => t.id)).toEqual(['b', 'c', 'a'])
  })

  it('within the same importance, sooner deadlines come first', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-07-20' }),
      task({ id: 'b', dueDate: '2026-07-12' }),
      task({ id: 'c' })
    ]
    expect(sortTasks(tasks, 'importance').map((t) => t.id)).toEqual(['b', 'a', 'c'])
  })

  it('does not mutate the input array', () => {
    const tasks = [task({ id: 'b', importance: 'low' }), task({ id: 'a', importance: 'high' })]
    sortTasks(tasks, 'importance')
    expect(tasks[0].id).toBe('b')
  })
})

describe('sortTasks soonest mode', () => {
  it('orders by deadline ascending regardless of importance', () => {
    const tasks = [
      task({ id: 'a', importance: 'high', dueDate: '2026-07-20' }),
      task({ id: 'b', importance: 'low', dueDate: '2026-07-11' })
    ]
    expect(sortTasks(tasks, 'soonest').map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('a time today beats end-of-day today', () => {
    const tasks = [
      task({ id: 'a', dueDate: '2026-07-11' }),
      task({ id: 'b', dueDate: '2026-07-11', dueTime: '09:00' })
    ]
    expect(sortTasks(tasks, 'soonest').map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('tasks without deadlines come after dated ones, ordered by importance', () => {
    const tasks = [
      task({ id: 'a', importance: 'low' }),
      task({ id: 'b', importance: 'high' }),
      task({ id: 'c', importance: 'low', dueDate: '2026-08-01' })
    ]
    expect(sortTasks(tasks, 'soonest').map((t) => t.id)).toEqual(['c', 'b', 'a'])
  })

  it('a malformed date is treated as no deadline, not garbage-first', () => {
    const tasks = [
      task({ id: 'a', dueDate: 'not-a-date' }),
      task({ id: 'b', dueDate: '2026-07-12' })
    ]
    expect(sortTasks(tasks, 'soonest').map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('older tasks come before newer ones when deadline and importance tie', () => {
    const tasks = [
      task({ id: 'a', createdAt: '2026-07-09T09:00:00' }),
      task({ id: 'b', createdAt: '2026-06-01T09:00:00' })
    ]
    expect(sortTasks(tasks, 'soonest').map((t) => t.id)).toEqual(['b', 'a'])
    expect(sortTasks(tasks, 'importance').map((t) => t.id)).toEqual(['b', 'a'])
  })

  it('ties break stably by id', () => {
    const tasks = [task({ id: 'z' }), task({ id: 'a' })]
    expect(sortTasks(tasks, 'soonest').map((t) => t.id)).toEqual(['a', 'z'])
    expect(sortTasks([...tasks].reverse(), 'soonest').map((t) => t.id)).toEqual(['a', 'z'])
  })
})
