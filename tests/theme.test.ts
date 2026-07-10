import { describe, expect, it } from 'vitest'
import { resolveTheme } from '../src/shared/theme'

const auto = { theme: 'auto' as const, nightStartsAt: '18:30', dayStartsAt: '06:30' }

function at(hhmm: string): Date {
  const [h, m] = hhmm.split(':').map(Number)
  return new Date(2026, 6, 10, h, m)
}

describe('resolveTheme', () => {
  it('is day during the afternoon', () => {
    expect(resolveTheme(at('14:00'), auto)).toBe('day')
  })
  it('flips to night exactly at 18:30', () => {
    expect(resolveTheme(at('18:29'), auto)).toBe('day')
    expect(resolveTheme(at('18:30'), auto)).toBe('night')
  })
  it('flips to day exactly at 06:30', () => {
    expect(resolveTheme(at('06:29'), auto)).toBe('night')
    expect(resolveTheme(at('06:30'), auto)).toBe('day')
  })
  it('is night at midnight', () => {
    expect(resolveTheme(at('00:00'), auto)).toBe('night')
  })
  it('manual override wins over the clock', () => {
    expect(resolveTheme(at('23:00'), { ...auto, theme: 'day' })).toBe('day')
    expect(resolveTheme(at('12:00'), { ...auto, theme: 'night' })).toBe('night')
  })
})
