import { describe, expect, it } from 'vitest'
import type { CalendarEvent, Task } from '../src/shared/types'
import { dueReminders } from '../src/shared/reminders'

const OPTS = { leaveByBufferMinutes: 25, taskReminderMinutes: 10, windowMs: 60_000 }
const NOW = new Date(2026, 6, 13, 14, 0, 0) // Mon Jul 13, 2:00:00 pm

function task(o: Partial<Task> & { id: string }): Task {
  return { title: o.id, importance: 'medium', source: 'local', createdAt: '2026-07-01T09:00:00', ...o }
}
function ev(o: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { title: o.id, start: '2026-07-13T14:25:00', end: '2026-07-13T15:00:00', allDay: false, ...o }
}

describe('dueReminders — events', () => {
  it('fires at start minus the leave-by buffer', () => {
    // event at 14:25, buffer 25 → fireAt 14:00 → due exactly at NOW
    const r = dueReminders([], [ev({ id: 'e1', title: 'Dentist', start: '2026-07-13T14:25:00', end: '2026-07-13T15:00:00' })], NOW, OPTS)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ key: 'event:e1:2026-07-13' })
    expect(r[0].title).toBe('Coming up: Dentist')
    expect(r[0].body).toMatch(/^starts at 2:25/)
  })
  it('does not fire when fireAt is older than the window', () => {
    // event at 14:20 → fireAt 13:55 → 5 min before NOW, window only 60s
    expect(dueReminders([], [ev({ id: 'e', start: '2026-07-13T14:20:00', end: '2026-07-13T15:00:00' })], NOW, OPTS)).toHaveLength(0)
  })
  it('does not fire once the event has started', () => {
    // buffer large enough that fireAt is in-window but start already passed
    const started = ev({ id: 'e', start: '2026-07-13T13:55:00', end: '2026-07-13T14:30:00' })
    expect(dueReminders([], [started], new Date(2026, 6, 13, 14, 0), { ...OPTS, leaveByBufferMinutes: 5 })).toHaveLength(0)
  })
  it('ignores all-day events', () => {
    expect(dueReminders([], [ev({ id: 'e', start: '2026-07-13', end: '2026-07-14', allDay: true })], NOW, OPTS)).toHaveLength(0)
  })
})

describe('dueReminders — tasks', () => {
  it('fires taskReminderMinutes before a timed task', () => {
    // task due 14:10, lead 10 → fireAt 14:00 → due at NOW
    const r = dueReminders([task({ id: 't1', title: 'Call mum', dueDate: '2026-07-13', dueTime: '14:10' })], [], NOW, OPTS)
    expect(r).toHaveLength(1)
    expect(r[0]).toMatchObject({ key: 'task:t1:2026-07-13', title: 'Call mum' })
    expect(r[0].body).toMatch(/^due at 2:10/)
  })
  it('ignores tasks without a time, completed, or snoozed', () => {
    const tasks = [
      task({ id: 'noTime', dueDate: '2026-07-13' }),
      task({ id: 'done', dueDate: '2026-07-13', dueTime: '14:10', completedAt: '2026-07-13T09:00:00' }),
      task({ id: 'snoozed', dueDate: '2026-07-13', dueTime: '14:10', snoozedUntil: '2026-07-14T00:00:00' })
    ]
    expect(dueReminders(tasks, [], NOW, OPTS)).toHaveLength(0)
  })
  it('does not fire after the due time has passed', () => {
    const past = task({ id: 't', dueDate: '2026-07-13', dueTime: '13:59' })
    expect(dueReminders([past], [], NOW, OPTS)).toHaveLength(0)
  })
  it('a malformed time never throws and never fires', () => {
    const bad = task({ id: 't', dueDate: '2026-07-13', dueTime: 'nonsense' })
    expect(dueReminders([bad], [], NOW, OPTS)).toEqual([])
  })
})
