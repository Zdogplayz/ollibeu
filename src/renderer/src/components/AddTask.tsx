import { useRef, useState } from 'react'
import type { Importance } from '@shared/types'

export default function AddTask(props: {
  onAdd: (
    title: string,
    importance: Importance,
    dueDate?: string,
    dueTime?: string,
    repeat?: 'daily' | 'weekly' | 'monthly'
  ) => void
}) {
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState<Importance>('medium')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [repeat, setRepeat] = useState<'' | 'daily' | 'weekly' | 'monthly'>('')
  const dateRef = useRef<HTMLInputElement>(null)
  const timeRef = useRef<HTMLInputElement>(null)

  function openPicker(ref: React.RefObject<HTMLInputElement | null>): void {
    const el = ref.current
    if (!el || el.disabled) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.onAdd(
      trimmed,
      importance,
      dueDate || undefined,
      dueDate ? dueTime || undefined : undefined,
      dueDate ? repeat || undefined : undefined
    )
    setTitle('')
    setDueDate('')
    setDueTime('')
    setRepeat('')
  }

  return (
    <form className="add-task" onSubmit={submit}>
      <input
        type="text"
        placeholder="+ add something"
        aria-label="New task"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <select
        aria-label="Importance"
        value={importance}
        onChange={(e) => setImportance(e.target.value as Importance)}
      >
        <option value="high">important</option>
        <option value="medium">soon-ish</option>
        <option value="low">whenever</option>
      </select>
      <label className="when-field" title="when? (optional)" onClick={() => openPicker(dateRef)}>
        <svg className="field-icon" viewBox="0 0 16 16" aria-hidden="true">
          <rect x="1.5" y="2.5" width="13" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.5" />
          <path d="M5 1v3M11 1v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={dateRef}
          type="date"
          aria-label="When (optional)"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value)
            if (!e.target.value) {
              setDueTime('')
              setRepeat('')
            }
          }}
        />
      </label>
      <label className="when-field" title="what time? (optional)" onClick={() => openPicker(timeRef)}>
        <svg className="field-icon" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          ref={timeRef}
          type="time"
          aria-label="Time (optional)"
          value={dueTime}
          disabled={!dueDate}
          onChange={(e) => setDueTime(e.target.value)}
        />
      </label>
      <select
        aria-label="Repeat (optional)"
        value={repeat}
        disabled={!dueDate}
        onChange={(e) => setRepeat(e.target.value as '' | 'daily' | 'weekly' | 'monthly')}
      >
        <option value="">no repeat</option>
        <option value="daily">daily</option>
        <option value="weekly">weekly</option>
        <option value="monthly">monthly</option>
      </select>
      <button type="submit" className="pill-button">
        add
      </button>
    </form>
  )
}
