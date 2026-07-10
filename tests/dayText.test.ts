import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { completedTodayCount, greetingFor } from '../src/shared/dayText'

function at(h: number, m = 0): Date {
  return new Date(2026, 6, 10, h, m)
}

describe('greetingFor', () => {
  it('morning before noon', () => {
    expect(greetingFor(at(8), false)).toBe('Good morning')
  })
  it('afternoon from noon to 5pm', () => {
    expect(greetingFor(at(12), false)).toBe('Good afternoon')
    expect(greetingFor(at(16, 59), false)).toBe('Good afternoon')
  })
  it('evening from 5pm', () => {
    expect(greetingFor(at(17), false)).toBe('Good evening')
  })
  it('night mode always winds down', () => {
    expect(greetingFor(at(20), true)).toBe('Winding down')
    expect(greetingFor(at(5), true)).toBe('Winding down')
  })
})

describe('completedTodayCount', () => {
  const base: Omit<Task, 'id'> = {
    title: 't',
    importance: 'low',
    source: 'local',
    createdAt: '2026-07-01T09:00:00'
  }
  it('counts only completions from today', () => {
    const tasks: Task[] = [
      { ...base, id: 'a', completedAt: '2026-07-10T09:00:00' },
      { ...base, id: 'b', completedAt: '2026-07-09T23:59:00' },
      { ...base, id: 'c' }
    ]
    expect(completedTodayCount(tasks, at(14))).toBe(1)
  })
})
