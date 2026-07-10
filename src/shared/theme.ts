import type { Settings } from './types'

export type ResolvedTheme = 'day' | 'night'

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function resolveTheme(
  now: Date,
  settings: Pick<Settings, 'theme' | 'nightStartsAt' | 'dayStartsAt'>
): ResolvedTheme {
  if (settings.theme !== 'auto') return settings.theme
  const mins = now.getHours() * 60 + now.getMinutes()
  return mins >= minutesOf(settings.dayStartsAt) && mins < minutesOf(settings.nightStartsAt)
    ? 'day'
    : 'night'
}
