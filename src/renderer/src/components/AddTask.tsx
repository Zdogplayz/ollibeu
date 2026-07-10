import { useState } from 'react'
import type { Importance } from '@shared/types'

export default function AddTask(props: {
  onAdd: (title: string, importance: Importance, dueDate?: string, dueTime?: string) => void
}) {
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState<Importance>('medium')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.onAdd(trimmed, importance, dueDate || undefined, dueDate ? dueTime || undefined : undefined)
    setTitle('')
    setDueDate('')
    setDueTime('')
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
      <input
        type="date"
        aria-label="When (optional)"
        title="when? (optional)"
        value={dueDate}
        onChange={(e) => {
          setDueDate(e.target.value)
          if (!e.target.value) setDueTime('')
        }}
      />
      <input
        type="time"
        aria-label="Time (optional)"
        title="what time? (optional)"
        value={dueTime}
        disabled={!dueDate}
        onChange={(e) => setDueTime(e.target.value)}
      />
      <button type="submit" className="pill-button">
        add
      </button>
    </form>
  )
}
