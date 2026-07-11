import { useState } from 'react'
import type { AddEventInput, AddEventResult } from '@shared/types'

export default function AddEvent(props: {
  onAdd: (input: AddEventInput) => Promise<AddEventResult>
  onReauth: () => void
  today: string // YYYY-MM-DD
}) {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [date, setDate] = useState(props.today)
  const [time, setTime] = useState('')
  const [duration, setDuration] = useState(60)
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState<'needs-reauth' | 'unreachable' | null>(null)

  if (!open) {
    return (
      <button
        type="button"
        className="link-button rail-add"
        onClick={() => {
          setDate(props.today)
          setDuration(60)
          setOpen(true)
        }}
      >
        + add to calendar
      </button>
    )
  }

  function submit(e: React.FormEvent): void {
    e.preventDefault()
    const trimmed = title.trim()
    if (!trimmed || !date || busy) return
    setBusy(true)
    setTrouble(null)
    void props
      .onAdd({ title: trimmed, date, ...(time ? { time, durationMinutes: duration } : {}) })
      .then((result) => {
        if (result.ok) {
          setTitle('')
          setTime('')
          setOpen(false)
        } else {
          setTrouble(result.reason)
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <form className="add-event" onSubmit={submit}>
      <input
        type="text"
        placeholder="what's happening?"
        aria-label="Event title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <div className="add-event-when">
        <input type="date" aria-label="Event date" value={date} onChange={(e) => setDate(e.target.value)} />
        <input type="time" aria-label="Event time (optional)" value={time} onChange={(e) => setTime(e.target.value)} />
        {time && (
          <select aria-label="Duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
            <option value={30}>30 min</option>
            <option value={60}>1 hour</option>
            <option value={90}>1.5 hours</option>
            <option value={120}>2 hours</option>
          </select>
        )}
      </div>
      <div className="add-event-actions">
        <button type="submit" className="pill-button" disabled={busy}>
          {busy ? 'adding…' : 'add'}
        </button>
        <button type="button" className="pill-button quiet" onClick={() => setOpen(false)}>
          never mind
        </button>
      </div>
      {trouble === 'unreachable' && (
        <p className="placeholder-copy">Couldn’t reach Google just now — worth another try in a moment. 🍃</p>
      )}
      {trouble === 'needs-reauth' && (
        <p className="placeholder-copy">
          Google needs a fresh sign-in before Ollibeu can add events.{' '}
          <button type="button" className="link-button" onClick={props.onReauth}>
            sign in again
          </button>
        </p>
      )}
    </form>
  )
}
