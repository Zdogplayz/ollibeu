import type { Task, TaskSortMode } from './types'

export type { TaskSortMode }

const IMPORTANCE_ORDER: Record<Task['importance'], number> = { high: 0, medium: 1, low: 2 }

function deadlineOf(task: Task): number | null {
  if (!task.dueDate) return null
  const t = new Date(task.dueDate + 'T' + (task.dueTime ?? '23:59') + ':00').getTime()
  return Number.isNaN(t) ? null : t
}

function byDeadline(a: Task, b: Task): number {
  const da = deadlineOf(a)
  const db = deadlineOf(b)
  if (da === null && db === null) return 0
  if (da === null) return 1
  if (db === null) return -1
  return da - db
}

function byImportance(a: Task, b: Task): number {
  return IMPORTANCE_ORDER[a.importance] - IMPORTANCE_ORDER[b.importance]
}

function byAge(a: Task, b: Task): number {
  return a.createdAt.localeCompare(b.createdAt)
}

export function sortTasks(tasks: Task[], mode: TaskSortMode): Task[] {
  const primary = mode === 'importance' ? [byImportance, byDeadline] : [byDeadline, byImportance]
  return [...tasks].sort((a, b) => {
    for (const cmp of primary) {
      const r = cmp(a, b)
      if (r !== 0) return r
    }
    return byAge(a, b) || a.id.localeCompare(b.id)
  })
}
