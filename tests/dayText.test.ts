import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { completedTodayCount, greetingFor, dueLabel } from '../src/shared/dayText'

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

describe('dueLabel', () => {
  const now = new Date(2026, 6, 10, 14, 0) // Friday July 10
  it('says today / tomorrow without a time', () => {
    expect(dueLabel('2026-07-10', undefined, now)).toBe('today')
    expect(dueLabel('2026-07-11', undefined, now)).toBe('tomorrow')
  })
  it('appends a friendly time when present', () => {
    expect(dueLabel('2026-07-10', '16:00', now)).toMatch(/^today · 4:00/)
  })
  it('uses a short calendar form for other days', () => {
    expect(dueLabel('2026-07-17', undefined, now)).toMatch(/Jul/)
    expect(dueLabel('2026-07-17', undefined, now)).toMatch(/17/)
  })
  it('renders past dates with the same calm form (no guilt words)', () => {
    const label = dueLabel('2026-07-08', undefined, now)
    expect(label).toMatch(/Jul/)
    expect(label.toLowerCase()).not.toMatch(/overdue|late|behind|failed/)
  })
})
