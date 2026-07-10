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
