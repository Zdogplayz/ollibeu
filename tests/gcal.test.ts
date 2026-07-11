import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../src/shared/types'
import { eventsForDay, leaveByLabel, mapGoogleEvent, tomorrowPeek } from '../src/shared/gcal'

const NOW = new Date(2026, 6, 10, 14, 0) // Fri Jul 10, 2:00 pm

function ev(overrides: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return { title: overrides.id, start: '2026-07-10T16:00:00', end: '2026-07-10T17:00:00', allDay: false, ...overrides }
}

describe('mapGoogleEvent', () => {
  it('maps a timed event', () => {
    const e = mapGoogleEvent({
      id: 'x1',
      summary: 'Dentist',
      status: 'confirmed',
      start: { dateTime: '2026-07-10T16:00:00-04:00' },
      end: { dateTime: '2026-07-10T17:00:00-04:00' }
    })
    expect(e).toMatchObject({ id: 'x1', title: 'Dentist', allDay: false })
  })
  it('maps an all-day event', () => {
    const e = mapGoogleEvent({
      id: 'x2',
      summary: 'Trip',
      status: 'confirmed',
      start: { date: '2026-07-11' },
      end: { date: '2026-07-12' }
    })
    expect(e).toMatchObject({ id: 'x2', allDay: true, start: '2026-07-11' })
  })
  it('drops cancelled and malformed entries', () => {
    expect(mapGoogleEvent({ id: 'x', status: 'cancelled', start: { date: '2026-07-11' }, end: { date: '2026-07-12' } })).toBeNull()
    expect(mapGoogleEvent({ summary: 'no id' })).toBeNull()
    expect(mapGoogleEvent(null)).toBeNull()
  })
  it('untitled events get gentle placeholder', () => {
    const e = mapGoogleEvent({ id: 'x3', status: 'confirmed', start: { dateTime: '2026-07-10T16:00:00' }, end: { dateTime: '2026-07-10T17:00:00' } })
    expect(e?.title).toBe('(something on the calendar)')
  })
})

describe('eventsForDay', () => {
  it('returns events overlapping the day, all-day first, sorted by start', () => {
    const events = [
      ev({ id: 'b', start: '2026-07-10T16:00:00', end: '2026-07-10T17:00:00' }),
      ev({ id: 'a', start: '2026-07-10T09:00:00', end: '2026-07-10T10:00:00' }),
      ev({ id: 'allday', start: '2026-07-10', end: '2026-07-11', allDay: true }),
      ev({ id: 'other-day', start: '2026-07-12T09:00:00', end: '2026-07-12T10:00:00' })
    ]
    expect(eventsForDay(events, NOW).map((e) => e.id)).toEqual(['allday', 'a', 'b'])
  })
})

describe('leaveByLabel', () => {
  it('labels an upcoming timed event today', () => {
    expect(leaveByLabel(ev({ id: 'x' }), 25, NOW)).toMatch(/^leave by 3:35/)
  })
  it('returns null for past events, all-day events, and other days', () => {
    expect(leaveByLabel(ev({ id: 'p', start: '2026-07-10T09:00:00', end: '2026-07-10T10:00:00' }), 25, NOW)).toBeNull()
    expect(leaveByLabel(ev({ id: 'a', start: '2026-07-10', end: '2026-07-11', allDay: true }), 25, NOW)).toBeNull()
    expect(leaveByLabel(ev({ id: 't', start: '2026-07-11T09:00:00', end: '2026-07-11T10:00:00' }), 25, NOW)).toBeNull()
  })
})

describe('tomorrowPeek', () => {
  it('celebrates an empty tomorrow', () => {
    expect(tomorrowPeek([], NOW)).toBe('Tomorrow: nothing on the calendar 😌')
  })
  it('mentions the first timed event', () => {
    const events = [ev({ id: 't', start: '2026-07-11T10:00:00', end: '2026-07-11T11:00:00' })]
    expect(tomorrowPeek(events, NOW)).toMatch(/^Tomorrow: quiet until 10:00/)
  })
  it('counts multiple events', () => {
    const events = [
      ev({ id: 't1', start: '2026-07-11T09:00:00', end: '2026-07-11T10:00:00' }),
      ev({ id: 't2', start: '2026-07-11T13:00:00', end: '2026-07-11T14:00:00' })
    ]
    expect(tomorrowPeek(events, NOW)).toMatch(/^Tomorrow: 2 things, first at 9:00/)
  })
})
