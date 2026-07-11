import type { Task } from './types'

export function nextOccurrence(
  dueDate: string,
  repeat: 'daily' | 'weekly' | 'monthly',
  today: string
): string {
  const todayDate = new Date(today + 'T00:00:00')

  if (repeat === 'daily') {
    const tomorrow = new Date(todayDate)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return formatDate(tomorrow)
  }

  if (repeat === 'weekly') {
    const dueDateObj = new Date(dueDate + 'T00:00:00')
    const targetWeekday = dueDateObj.getDay()

    let candidate = new Date(todayDate)
    candidate.setDate(candidate.getDate() + 1)

    while (candidate.getDay() !== targetWeekday) {
      candidate.setDate(candidate.getDate() + 1)
    }

    return formatDate(candidate)
  }

  if (repeat === 'monthly') {
    const dueDateObj = new Date(dueDate + 'T00:00:00')
    const dayOfMonth = dueDateObj.getDate()

    // Try current month
    let candidate = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1)
    const monthLength = daysInMonth(candidate.getFullYear(), candidate.getMonth())
    const targetDay = Math.min(dayOfMonth, monthLength)
    candidate.setDate(targetDay)

    if (candidate > todayDate) {
      return formatDate(candidate)
    }

    // Try next month
    candidate = new Date(todayDate.getFullYear(), todayDate.getMonth() + 1, 1)
    const nextMonthLength = daysInMonth(candidate.getFullYear(), candidate.getMonth())
    const nextTargetDay = Math.min(dayOfMonth, nextMonthLength)
    candidate.setDate(nextTargetDay)

    return formatDate(candidate)
  }

  throw new Error(`Unknown repeat type: ${repeat}`)
}

export function completeRecurring(
  task: Task,
  completedAtIso: string,
  newId: string
): { done: Task; next: Task } {
  // completedAtIso may be UTC ("Z") or offset form — always resolve to the LOCAL calendar day
  const completedDate = formatDate(new Date(completedAtIso))

  const done: Task = {
    ...task,
    id: newId,
    completedAt: completedAtIso
  }
  delete done.repeat

  const next: Task = {
    ...task,
    dueDate: task.repeat && task.dueDate ? nextOccurrence(task.dueDate, task.repeat, completedDate) : task.dueDate
  }
  delete next.completedAt
  delete next.snoozedUntil
  delete next.gtasksSyncPending

  return { done, next }
}

export function snoozeUntilTomorrow(now: Date): string {
  const tomorrow = new Date(now)
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  return tomorrow.toISOString()
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
