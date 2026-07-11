import { describe, expect, it } from 'vitest'
import type { Task } from '../src/shared/types'
import { completeRecurring, nextOccurrence, snoozeUntilTomorrow } from '../src/shared/recurrence'

function task(overrides: Partial<Task> & { id: string }): Task {
  return {
    title: overrides.id,
    importance: 'medium',
    source: 'local',
    createdAt: '2026-07-01T09:00:00',
    ...overrides
  }
}

describe('nextOccurrence', () => {
  it('daily is always tomorrow relative to today', () => {
    expect(nextOccurrence('2026-07-11', 'daily', '2026-07-11')).toBe('2026-07-12')
    // even when the task sat overdue for days, no stacking — just tomorrow
    expect(nextOccurrence('2026-07-01', 'daily', '2026-07-11')).toBe('2026-07-12')
  })
  it('weekly lands on the same weekday, strictly after today', () => {
    // 2026-07-11 is a Saturday
    expect(nextOccurrence('2026-07-11', 'weekly', '2026-07-11')).toBe('2026-07-18')
    // overdue weekly (was Wed 07-08, today Sat 07-11) → next Wed
    expect(nextOccurrence('2026-07-08', 'weekly', '2026-07-11')).toBe('2026-07-15')
  })
  it('monthly keeps the day-of-month, clamped to short months', () => {
    expect(nextOccurrence('2026-07-11', 'monthly', '2026-07-11')).toBe('2026-08-11')
    expect(nextOccurrence('2026-01-31', 'monthly', '2026-01-31')).toBe('2026-02-28')
    // overdue monthly (was 06-15, today 07-11) → 07-15 (this month, still ahead)
    expect(nextOccurrence('2026-06-15', 'monthly', '2026-07-11')).toBe('2026-07-15')
  })
})

describe('completeRecurring', () => {
  it('splits into a completed history copy and a forward-dated original', () => {
    const t = task({ id: 'meds', dueDate: '2026-07-11', dueTime: '09:00', repeat: 'daily' })
    const { done, next } = completeRecurring(t, '2026-07-11T09:05:00', 'copy-1')
    expect(done).toMatchObject({ id: 'copy-1', completedAt: '2026-07-11T09:05:00', title: 'meds' })
    expect(done.repeat).toBeUndefined()
    expect(next).toMatchObject({ id: 'meds', dueDate: '2026-07-12', dueTime: '09:00', repeat: 'daily' })
    expect(next.completedAt).toBeUndefined()
    expect(next.snoozedUntil).toBeUndefined()
  })
})

describe('snoozeUntilTomorrow', () => {
  it('is the very start of the next local day', () => {
    const iso = snoozeUntilTomorrow(new Date(2026, 6, 11, 14, 30))
    const parsed = new Date(iso)
    expect(parsed.getDate()).toBe(12)
    expect(parsed.getHours()).toBe(0)
    expect(parsed.getMinutes()).toBe(0)
  })
})
