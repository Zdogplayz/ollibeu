import type { Task } from './types'

export interface RemoteGtask {
  id: string
  listId: string
  title: string
  due?: string
  completed: boolean
}

export function mapGtaskDue(due: unknown): string | undefined {
  if (typeof due !== 'string') return undefined
  const day = due.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return undefined
  const parsed = new Date(day + 'T00:00:00')
  if (Number.isNaN(parsed.getTime())) return undefined
  // reject calendar-invalid dates that Date silently rolls forward (e.g. Feb 30)
  const roundTrip = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`
  return roundTrip === day ? day : undefined
}

export function mergeGtasks(
  local: Task[],
  remote: RemoteGtask[],
  nowIso: string
): { tasks: Task[]; toComplete: { listId: string; taskId: string }[] } {
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const toComplete: { listId: string; taskId: string }[] = []
  const tasks: Task[] = []

  for (const t of local) {
    if (t.source !== 'gtasks' || !t.gtasksId) {
      tasks.push(t)
      continue
    }
    if (t.gtasksSyncPending && t.completedAt) {
      toComplete.push({ listId: t.gtasksListId ?? '', taskId: t.gtasksId })
      tasks.push(t)
      remoteById.delete(t.gtasksId)
      continue
    }
    const r = remoteById.get(t.gtasksId)
    if (!r) continue // vanished remotely — drop the mirror row
    remoteById.delete(t.gtasksId)
    tasks.push({
      ...t,
      title: r.title || t.title,
      dueDate: mapGtaskDue(r.due),
      completedAt: r.completed ? (t.completedAt ?? nowIso) : t.completedAt
    })
  }

  for (const r of remoteById.values()) {
    tasks.push({
      id: `gtasks:${r.listId}:${r.id}`,
      title: r.title || '(untitled)',
      importance: 'medium',
      source: 'gtasks',
      gtasksId: r.id,
      gtasksListId: r.listId,
      ...(mapGtaskDue(r.due) ? { dueDate: mapGtaskDue(r.due) } : {}),
      createdAt: nowIso,
      ...(r.completed ? { completedAt: nowIso } : {})
    })
  }

  return { tasks, toComplete }
}
