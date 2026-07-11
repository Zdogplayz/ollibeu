import { useEffect, useRef } from 'react'

const PLANTS = ['🌱', '🌿', '🍀', '🪴', '🌷', '🌸', '🌻', '🌳']
const MAX_PLANTS = 240

export default function GardenPanel(props: { completedCount: number; onClose: () => void }) {
  const doneRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    doneRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') props.onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const { completedCount } = props
  const shownCount = Math.min(completedCount, MAX_PLANTS)

  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose()
      }}
    >
      <div
        className="settings-panel garden-panel card"
        role="dialog"
        aria-modal="true"
        aria-label="Your garden"
      >
        <div className="settings-head">
          <div className="section-label">Your garden</div>
          <button type="button" className="pill-button quiet" ref={doneRef} onClick={props.onClose}>
            done
          </button>
        </div>
        {completedCount === 0 ? (
          <p className="placeholder-copy">
            Your garden is waiting for its first sprout — finish any little thing. 🌱
          </p>
        ) : (
          <>
            <div className="garden-grid">
              {Array.from({ length: shownCount }, (_, i) => (
                <span
                  key={i}
                  className={i === shownCount - 1 ? 'plant new-plant' : 'plant'}
                >
                  {PLANTS[i % PLANTS.length]}
                </span>
              ))}
            </div>
            {completedCount > MAX_PLANTS && (
              <p className="placeholder-copy">+{completedCount - MAX_PLANTS} more in bloom</p>
            )}
          </>
        )}
        <p className="garden-count">
          {completedCount} {completedCount === 1 ? 'thing has' : 'things have'} grown here — nothing
          ever wilts. 🌱
        </p>
      </div>
    </div>
  )
}
