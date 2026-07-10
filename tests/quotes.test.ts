import { describe, expect, it } from 'vitest'
import { QUOTES, quoteForDate } from '../src/renderer/src/quotes'

describe('quoteForDate', () => {
  it('has a non-trivial deck', () => {
    expect(QUOTES.length).toBeGreaterThanOrEqual(10)
  })
  it('is stable within a day and drawn from the deck', () => {
    const q = quoteForDate(new Date(2026, 6, 10, 9))
    expect(q).toBe(quoteForDate(new Date(2026, 6, 10, 22)))
    expect(QUOTES).toContain(q)
  })
  it('changes across consecutive days', () => {
    expect(quoteForDate(new Date(2026, 6, 10))).not.toBe(quoteForDate(new Date(2026, 6, 11)))
  })
})
