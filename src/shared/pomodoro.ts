import type { PomodoroSettings } from './types'

export type PomoPhase = 'focus' | 'shortBreak' | 'longBreak'

/** mm:ss, seconds zero-padded, minutes uncapped, never negative. */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const mins = Math.floor(s / 60)
  const secs = s % 60
  return `${mins}:${String(secs).padStart(2, '0')}`
}

export function phaseMinutes(phase: PomoPhase, s: PomodoroSettings): number {
  if (phase === 'focus') return s.workMinutes
  if (phase === 'shortBreak') return s.shortBreakMinutes
  return s.longBreakMinutes
}

/**
 * Given the phase that just finished and how many focus sessions were done
 * before it, return the next phase and updated count. Focus → break (long
 * every `roundsBeforeLongBreak`th time); any break → focus.
 */
export function nextPhase(
  phase: PomoPhase,
  completedFocusSessions: number,
  s: PomodoroSettings
): { phase: PomoPhase; completedFocusSessions: number } {
  if (phase === 'focus') {
    const done = completedFocusSessions + 1
    const long = s.roundsBeforeLongBreak > 0 && done % s.roundsBeforeLongBreak === 0
    return { phase: long ? 'longBreak' : 'shortBreak', completedFocusSessions: done }
  }
  return { phase: 'focus', completedFocusSessions }
}
