import type { Task } from './types'

export function greetingFor(now: Date, night: boolean): string {
  if (night) return 'Winding down'
  const h = now.getHours()
  if (h < 12) return 'Good morning'
  if (h < 17) return 'Good afternoon'
  return 'Good evening'
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  )
}

export function completedTodayCount(tasks: Task[], now: Date): number {
  return tasks.filter((t) => t.completedAt && sameDay(new Date(t.completedAt), now)).length
}

export function finishedLabel(completedAtIso: string, now: Date): string {
  const done = new Date(completedAtIso)
  if (Number.isNaN(done.getTime())) return ''
  return sameDay(done, now)
    ? done.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : done.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function dueLabel(dueDate: string, dueTime: string | undefined, now: Date): string {
  const due = new Date(dueDate + 'T00:00:00')
  if (Number.isNaN(due.getTime())) return ''
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  let day: string
  if (diffDays === 0) day = 'today'
  else if (diffDays === 1) day = 'tomorrow'
  else day = due.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
  if (!dueTime) return day
  const [h, m] = dueTime.split(':').map(Number)
  const at = new Date(2000, 0, 1, h, m)
  if (Number.isNaN(at.getTime())) return day
  return `${day} · ${at.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`
}
