import React from 'react'
import { createRoot } from 'react-dom/client'
import './theme.css'

document.documentElement.dataset.theme = 'day'

function Capture() {
  const [text, setText] = React.useState('')
  function submit(): void {
    const trimmed = text.trim()
    if (trimmed) {
      void window.ollibeu.mutate.addTask({
        id: crypto.randomUUID(),
        title: trimmed,
        importance: 'medium',
        source: 'local',
        createdAt: new Date().toISOString()
      })
    }
    window.close()
  }
  return (
    <div className="capture-box">
      <input
        autoFocus
        type="text"
        placeholder="catch the thought… (Enter saves, Esc closes)"
        aria-label="Quick thought"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit()
          if (e.key === 'Escape') window.close()
        }}
      />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<Capture />)
