import { useEffect, useRef, useState } from 'react'
import type { PomodoroSettings } from '@shared/types'
import { formatClock, nextPhase, phaseMinutes, type PomoPhase } from '@shared/pomodoro'

const R = 52 // ring radius
const CIRC = 2 * Math.PI * R

const PHASE_LABEL: Record<PomoPhase, string> = {
  focus: 'Focus',
  shortBreak: 'Short break',
  longBreak: 'Long break'
}

const PHASE_DONE: Record<PomoPhase, string> = {
  focus: 'Nice focus. Time to breathe. 🍃',
  shortBreak: 'Back to it whenever you’re ready. 🌿',
  longBreak: 'Well earned. Ease back in gently. 🌿'
}

export default function PomodoroTimer(props: {
  settings: PomodoroSettings
  soundsEnabled: boolean
  onChime: () => void
}) {
  const [phase, setPhase] = useState<PomoPhase>('focus')
  const [remaining, setRemaining] = useState(props.settings.workMinutes * 60)
  const [running, setRunning] = useState(false)
  const [completed, setCompleted] = useState(0)
  const [flash, setFlash] = useState<string | null>(null)

  // latest values the ticking interval needs, without re-subscribing every render
  const live = useRef({ phase, completed, settings: props.settings, soundsEnabled: props.soundsEnabled, onChime: props.onChime })
  live.current = { phase, completed, settings: props.settings, soundsEnabled: props.soundsEnabled, onChime: props.onChime }

  const endsAtRef = useRef<number | null>(null)
  const flashTimer = useRef<number | undefined>(undefined)

  const total = phaseMinutes(phase, props.settings) * 60

  // reflect edited durations while idle (a running timer keeps its endpoint)
  useEffect(() => {
    if (!running) setRemaining(phaseMinutes(live.current.phase, props.settings) * 60)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.settings.workMinutes, props.settings.shortBreakMinutes, props.settings.longBreakMinutes])

  // single interval, subscribed only on the running transition; reads `live` refs
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      const endsAt = endsAtRef.current
      if (endsAt == null) return
      const rem = Math.round((endsAt - Date.now()) / 1000)
      if (rem > 0) {
        setRemaining(rem)
        return
      }
      // phase complete — advance (plain setState, not nested in an updater)
      const { phase: donePhase, completed: doneCount, settings, soundsEnabled, onChime } = live.current
      const next = nextPhase(donePhase, doneCount, settings)
      endsAtRef.current = null
      setRunning(false)
      setCompleted(next.completedFocusSessions)
      setPhase(next.phase)
      setRemaining(phaseMinutes(next.phase, settings) * 60)
      if (soundsEnabled) onChime()
      setFlash(PHASE_DONE[donePhase])
      window.clearTimeout(flashTimer.current)
      flashTimer.current = window.setTimeout(() => setFlash(null), 6000)
    }, 250)
    return () => window.clearInterval(id)
  }, [running])

  useEffect(() => () => window.clearTimeout(flashTimer.current), [])

  function toggle(): void {
    if (running) {
      setRunning(false)
      endsAtRef.current = null
      return
    }
    endsAtRef.current = Date.now() + remaining * 1000
    setRunning(true)
  }

  function reset(): void {
    setRunning(false)
    endsAtRef.current = null
    setPhase('focus')
    setCompleted(0)
    setFlash(null)
    setRemaining(props.settings.workMinutes * 60)
  }

  const progress = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0

  return (
    <section className={`pomodoro pomo-${phase}`}>
      <div className="pomo-ring-wrap">
        <svg className="pomo-ring" viewBox="0 0 120 120">
          <circle className="pomo-track" cx="60" cy="60" r={R} fill="none" />
          <circle
            className="pomo-progress"
            cx="60"
            cy="60"
            r={R}
            fill="none"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - progress)}
            transform="rotate(-90 60 60)"
          />
        </svg>
        <div className="pomo-center">
          <div className="pomo-time">{formatClock(remaining)}</div>
          <div className="pomo-phase">{PHASE_LABEL[phase]}</div>
        </div>
      </div>
      <div className="pomo-controls">
        <button type="button" className="pill-button" onClick={toggle}>
          {running ? 'pause' : remaining < total ? 'resume' : 'start'}
        </button>
        <button type="button" className="pill-button quiet" onClick={reset}>
          reset
        </button>
      </div>
      {completed > 0 && (
        <div className="pomo-rounds" aria-label={`${completed} focus sessions done`}>
          {Array.from({ length: Math.min(completed, 8) }, (_, i) => (
            <span key={i} className="pomo-dot" />
          ))}
        </div>
      )}
      {flash && <div className="pomo-flash">{flash}</div>}
    </section>
  )
}
