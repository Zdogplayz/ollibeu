import { useState } from 'react'
import type { Importance } from '@shared/types'

export default function AddTask(props: { onAdd: (title: string, importance: Importance) => void }) {
  const [title, setTitle] = useState('')
  const [importance, setImportance] = useState<Importance>('medium')

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) return
    props.onAdd(trimmed, importance)
    setTitle('')
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
      <button type="submit" className="pill-button">
        add
      </button>
    </form>
  )
}
