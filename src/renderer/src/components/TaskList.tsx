import type { Task } from '@shared/types'

export default function TaskList(props: {
  tasks: Task[]
  justDoneId: string | null
  onComplete: (id: string) => void
}) {
  if (props.tasks.length === 0) {
    return <p className="empty-hint">Nothing here right now — add something small if you like.</p>
  }
  return (
    <ul className="task-list">
      {props.tasks.map((t) => (
        <li
          key={t.id}
          className={`task-card importance-${t.importance}${t.id === props.justDoneId ? ' done' : ''}`}
        >
          <button
            className="check"
            aria-label={`Mark "${t.title}" done`}
            onClick={() => props.onComplete(t.id)}
          />
          <span>{t.title}</span>
        </li>
      ))}
    </ul>
  )
}
