export const QUOTES: string[] = [
  'Small steps still move you forward.',
  'Done is kinder than perfect.',
  'You can do the next five minutes.',
  'Starting badly beats not starting.',
  'Your brain is not broken — it just boots differently.',
  'One thing at a time is still momentum.',
  'Rest is part of the work.',
  'Future you says thanks for the little things.',
  'It counts even if it was easy.',
  'You have done hard things before breakfast.',
  'Half a task is not zero tasks.',
  'Gentle beats urgent, most days.'
]

export function quoteForDate(date: Date): string {
  const start = new Date(date.getFullYear(), 0, 0)
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000)
  return QUOTES[dayOfYear % QUOTES.length]
}
