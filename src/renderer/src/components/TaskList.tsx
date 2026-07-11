import { useEffect, useRef, useState } from 'react'
import type { Task } from '@shared/types'
import { dueLabel } from '@shared/dayText'
import { isPastDue } from '@shared/taskSort'
import ConfettiBurst from './ConfettiBurst'

export default function TaskList(props: {
  tasks: Task[]
  justDoneId: string | null
  pinnedId: string | null
  now: Date
  onComplete: (id: string) => void
  onTogglePin: (id: string) => void
  onSnooze: (id: string) => void
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
          className={`task-card importance-${t.importance}${t.id === props.justDoneId ? ' done' : ''}${t.id === props.pinnedId ? ' pinned' : ''}`}
        >
          <button
            type="button"
            className="check"
            aria-label={`Mark "${t.title}" done`}
            onClick={() => props.onComplete(t.id)}
          />
          <button
            type="button"
            className="task-title"
            title={t.id === props.pinnedId ? 'take it off the front card' : 'put this one up front'}
            aria-pressed={t.id === props.pinnedId}
            onClick={() => props.onTogglePin(t.id)}
          >
            {t.title}
          </button>
          {t.dueDate &&
            (() => {
              const past = isPastDue(t, props.now)
              const label = dueLabel(t.dueDate, t.dueTime, props.now)
              const text = past
                ? label === 'today'
                  ? 'waiting'
                  : `waiting · ${label.replace(/^today · /, '')}`
                : label
              return (
                <span className={`due-chip${past ? ' past' : ''}`}>
                  {t.repeat ? `↻ ${text}` : text}
                </span>
              )
            })()}
          {t.id === props.pinnedId && <span className="pinned-badge">up front ✨</span>}
          <button
            type="button"
            className="snooze-button"
            title="not today"
            aria-label={`Rest "${t.title}" until tomorrow`}
            onClick={() => props.onSnooze(t.id)}
          >
            🌙
          </button>
          {t.id === props.justDoneId && <ConfettiBurst />}
        </li>
      ))}
    </ul>
  )
}
