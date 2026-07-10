import type { Task } from './types'

const IMPORTANCE_SCORE: Record<Task['importance'], number> = {
  high: 100,
  medium: 50,
  low: 0
}

const DAY_MS = 86_400_000

export function isPickable(task: Task, now: Date): boolean {
  if (task.completedAt) return false
  if (task.snoozedUntil && new Date(task.snoozedUntil) > now) return false
  return true
}

export function scoreTask(task: Task, now: Date): number {
  let score = IMPORTANCE_SCORE[task.importance]
  if (task.dueDate) {
    const deadline = new Date(task.dueDate + 'T' + (task.dueTime ?? '23:59') + ':00')
    const daysUntilDue = (deadline.getTime() - now.getTime()) / DAY_MS
    if (daysUntilDue <= 0) score += 80
    else if (daysUntilDue <= 1) score += 60
    else if (daysUntilDue <= 3) score += 30
    else if (daysUntilDue <= 7) score += 10
  }
  const ageDays = (now.getTime() - new Date(task.createdAt).getTime()) / DAY_MS
  score += Math.min(Math.max(ageDays, 0) * 2, 20)
  return score
}

export function pickOneThing(tasks: Task[], now: Date, excludeIds: string[] = []): Task | null {
  const candidates = tasks.filter((t) => isPickable(t, now) && !excludeIds.includes(t.id))
  if (candidates.length === 0) return null
  return [...candidates].sort(
    (a, b) => scoreTask(b, now) - scoreTask(a, now) || a.id.localeCompare(b.id)
  )[0]
}
