import { useEffect, useRef, useState } from 'react'
import type { Task } from '@shared/types'
import { dueLabel } from '@shared/dayText'
import ConfettiBurst from './ConfettiBurst'

export default function TaskList(props: {
  tasks: Task[]
  justDoneId: string | null
  pinnedId: string | null
  now: Date
  onComplete: (id: string) => void
}) {
  const listRef = useRef<HTMLUListElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  useEffect(() => {
    const el = listRef.current
    if (el) setOverflowing(el.scrollHeight > el.clientHeight + 1)
  }, [props.tasks])

  if (props.tasks.length === 0) {
    return <p className="empty-hint">Nothing here right now — add something small if you like.</p>
  }
  return (
    <ul ref={listRef} className={`task-list${overflowing ? ' fading' : ''}`}>
      {props.tasks.map((t) => (
        <li
          key={t.id}
          className={`task-card importance-${t.importance}${t.id === props.justDoneId ? ' done' : ''}`}
        >
          <button
            type="button"
            className="check"
            aria-label={`Mark "${t.title}" done`}
            onClick={() => props.onComplete(t.id)}
          />
          <span className="task-title">{t.title}</span>
          {t.dueDate && <span className="due-chip">{dueLabel(t.dueDate, t.dueTime, props.now)}</span>}
          {t.id === props.pinnedId && <span className="pinned-badge">up front ✨</span>}
          {t.id === props.justDoneId && <ConfettiBurst />}
        </li>
      ))}
    </ul>
  )
}
