import { describe, expect, it } from 'vitest'
import type { CalendarEvent } from '../src/shared/types'
import { eventsForDay, leaveByLabel, mapGoogleEvent, tomorrowPeek, nextDayStr, relativeSyncLabel, nextEventCountdown } from '../src/shared/gcal'

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
    expect(leaveByLabel(ev({ id: 'x' }), 25, NOW)).toMatch(/^get ready around 3:35/)
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
  it('handles an all-day-only tomorrow', () => {
    const events = [ev({ id: 'a', start: '2026-07-11', end: '2026-07-12', allDay: true })]
    expect(tomorrowPeek(events, NOW)).toBe('Tomorrow: 1 thing on the calendar')
  })
})

describe('nextDayStr', () => {
  it('increments including month and year rollovers', () => {
    expect(nextDayStr('2026-07-11')).toBe('2026-07-12')
    expect(nextDayStr('2026-07-31')).toBe('2026-08-01')
    expect(nextDayStr('2026-12-31')).toBe('2027-01-01')
  })
})

describe('relativeSyncLabel', () => {
  const now = new Date(2026, 6, 10, 14, 0)
  it('grades recency gently', () => {
    expect(relativeSyncLabel(new Date(2026, 6, 10, 13, 59, 30).toISOString(), now)).toBe('synced just now')
    expect(relativeSyncLabel(new Date(2026, 6, 10, 13, 35).toISOString(), now)).toBe('synced 25 min ago')
    expect(relativeSyncLabel(new Date(2026, 6, 10, 9, 15).toISOString(), now)).toMatch(/^synced at 9:15/)
  })
})

describe('nextEventCountdown', () => {
  const now = new Date(2026, 6, 10, 14, 0)
  it('counts down a near event in minutes', () => {
    const events = [ev({ id: 'd', title: 'Dentist', start: '2026-07-10T15:30:00', end: '2026-07-10T16:30:00' })]
    expect(nextEventCountdown(events, now)).toBe('Dentist in 90 min')
  })
  it('uses a clock time for later today, null otherwise', () => {
    const later = [ev({ id: 'l', title: 'Call', start: '2026-07-10T19:00:00', end: '2026-07-10T19:30:00' })]
    expect(nextEventCountdown(later, now)).toMatch(/^Call at 7:00/)
    expect(nextEventCountdown([], now)).toBeNull()
    const past = [ev({ id: 'p', start: '2026-07-10T09:00:00', end: '2026-07-10T10:00:00' })]
    expect(nextEventCountdown(past, now)).toBeNull()
  })
})
