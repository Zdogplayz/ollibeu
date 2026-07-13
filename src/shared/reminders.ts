import type { CalendarEvent, Task } from './types'

export interface DueReminder {
  key: string // stable per occurrence, e.g. "event:<id>:<yyyy-mm-dd>" / "task:<id>:<yyyy-mm-dd>"
  title: string
  body: string
}

export interface ReminderOptions {
  leaveByBufferMinutes: number
  taskReminderMinutes: number
  windowMs: number // the poll window; a reminder is "due" when fireAt in (now-windowMs, now]
}

export function dueReminders(
  tasks: Task[],
  events: CalendarEvent[],
  now: Date,
  opts: ReminderOptions
): DueReminder[] {
  const result: DueReminder[] = []

  // Process events
  for (const event of events) {
    // Skip all-day events
    if (event.allDay) {
      continue
    }

    // Parse event start
    const eventStart = new Date(event.start)
    if (Number.isNaN(eventStart.getTime())) {
      continue
    }

    // Calculate fireAt
    const fireAt = new Date(eventStart.getTime() - opts.leaveByBufferMinutes * 60000)

    // Check if due: now - windowMs < fireAt <= now AND eventStart > now
    if (fireAt > new Date(now.getTime() - opts.windowMs) && fireAt <= now && eventStart > now) {
      const timeStr = eventStart.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      const dateStr = getLocalDateKey(eventStart)

      result.push({
        key: `event:${event.id}:${dateStr}`,
        title: `Coming up: ${event.title}`,
        body: `starts at ${timeStr} — a good moment to get ready. 🍃`
      })
    }
  }

  // Process tasks
  for (const task of tasks) {
    // Skip if no dueDate/dueTime, completed, or snoozed
    if (!task.dueDate || !task.dueTime || task.completedAt || task.snoozedUntil) {
      continue
    }

    // Parse task due datetime
    const dueDateTime = new Date(task.dueDate + 'T' + task.dueTime + ':00')
    if (Number.isNaN(dueDateTime.getTime())) {
      continue
    }

    // Calculate fireAt
    const fireAt = new Date(dueDateTime.getTime() - opts.taskReminderMinutes * 60000)

    // Check if due: now - windowMs < fireAt <= now AND dueDateTime > now
    if (fireAt > new Date(now.getTime() - opts.windowMs) && fireAt <= now && dueDateTime > now) {
      const timeStr = dueDateTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
      const dateStr = getLocalDateKey(dueDateTime)

      result.push({
        key: `task:${task.id}:${dateStr}`,
        title: task.title,
        body: `due at ${timeStr} — whenever you're ready. 🍃`
      })
    }
  }

  return result
}

/**
 * Get the local date key in YYYY-MM-DD format
 */
function getLocalDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
