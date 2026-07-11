import type { CalendarEvent } from './types'

interface RawTime {
  dateTime?: unknown
  date?: unknown
}

export function mapGoogleEvent(raw: unknown): CalendarEvent | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as { id?: unknown; summary?: unknown; status?: unknown; start?: RawTime; end?: RawTime }
  if (typeof r.id !== 'string' || r.status === 'cancelled') return null
  const start = timeOf(r.start)
  const end = timeOf(r.end)
  if (!start || !end) return null
  return {
    id: r.id,
    title: typeof r.summary === 'string' && r.summary ? r.summary : '(something on the calendar)',
    start: start.value,
    end: end.value,
    allDay: start.allDay
  }
}

function timeOf(t: RawTime | undefined): { value: string; allDay: boolean } | null {
  if (!t) return null
  if (typeof t.dateTime === 'string' && !Number.isNaN(new Date(t.dateTime).getTime())) {
    return { value: t.dateTime, allDay: false }
  }
  if (typeof t.date === 'string' && !Number.isNaN(new Date(t.date + 'T00:00:00').getTime())) {
    return { value: t.date, allDay: true }
  }
  return null
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function eventStart(e: CalendarEvent): Date {
  return e.allDay ? new Date(e.start + 'T00:00:00') : new Date(e.start)
}

function eventEnd(e: CalendarEvent): Date {
  // all-day end dates are exclusive in Google's model
  return e.allDay ? new Date(e.end + 'T00:00:00') : new Date(e.end)
}

export function eventsForDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  const dayStart = startOfDay(day)
  const dayEnd = new Date(dayStart.getTime() + 86_400_000)
  return events
    .filter((e) => eventStart(e) < dayEnd && eventEnd(e) > dayStart)
    .sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
      return eventStart(a).getTime() - eventStart(b).getTime() || a.id.localeCompare(b.id)
    })
}

export function leaveByLabel(event: CalendarEvent, bufferMinutes: number, now: Date): string | null {
  if (event.allDay) return null
  const start = eventStart(event)
  if (Number.isNaN(start.getTime())) return null
  if (startOfDay(start).getTime() !== startOfDay(now).getTime()) return null
  if (start <= now) return null
  const leaveAt = new Date(start.getTime() - bufferMinutes * 60_000)
  return `leave by ${leaveAt.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}

export function tomorrowPeek(events: CalendarEvent[], now: Date): string {
  const tomorrow = new Date(startOfDay(now).getTime() + 86_400_000)
  const list = eventsForDay(events, tomorrow)
  if (list.length === 0) return 'Tomorrow: nothing on the calendar 😌'
  const firstTimed = list.find((e) => !e.allDay)
  const firstAt = firstTimed
    ? eventStart(firstTimed).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : null
  if (list.length === 1 && firstAt) return `Tomorrow: quiet until ${firstAt} 😌`
  if (firstAt) return `Tomorrow: ${list.length} things, first at ${firstAt}`
  return `Tomorrow: ${list.length} ${list.length === 1 ? 'thing' : 'things'} on the calendar`
}
