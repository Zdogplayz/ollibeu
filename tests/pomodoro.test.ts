import { describe, expect, it } from 'vitest'
import type { PomodoroSettings } from '../src/shared/types'
import { formatClock, nextPhase, phaseMinutes } from '../src/shared/pomodoro'

const S: PomodoroSettings = {
  enabled: true,
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  roundsBeforeLongBreak: 4
}

describe('formatClock', () => {
  it('formats mm:ss with a zero-padded seconds field', () => {
    expect(formatClock(25 * 60)).toBe('25:00')
    expect(formatClock(65)).toBe('1:05')
    expect(formatClock(9)).toBe('0:09')
  })
  it('never shows negative time', () => {
    expect(formatClock(-3)).toBe('0:00')
  })
  it('allows minutes past 60 for long custom sessions', () => {
    expect(formatClock(90 * 60)).toBe('90:00')
  })
})

describe('phaseMinutes', () => {
  it('maps each phase to its configured length', () => {
    expect(phaseMinutes('focus', S)).toBe(25)
    expect(phaseMinutes('shortBreak', S)).toBe(5)
    expect(phaseMinutes('longBreak', S)).toBe(15)
  })
})

describe('nextPhase', () => {
  it('focus goes to a short break and counts the finished round', () => {
    expect(nextPhase('focus', 0, S)).toEqual({ phase: 'shortBreak', completedFocusSessions: 1 })
  })
  it('every Nth focus earns a long break', () => {
    // finishing the 4th focus session (roundsBeforeLongBreak = 4)
    expect(nextPhase('focus', 3, S)).toEqual({ phase: 'longBreak', completedFocusSessions: 4 })
    // the 8th as well
    expect(nextPhase('focus', 7, S)).toEqual({ phase: 'longBreak', completedFocusSessions: 8 })
  })
  it('any break returns to focus without changing the round count', () => {
    expect(nextPhase('shortBreak', 2, S)).toEqual({ phase: 'focus', completedFocusSessions: 2 })
    expect(nextPhase('longBreak', 4, S)).toEqual({ phase: 'focus', completedFocusSessions: 4 })
  })
})
