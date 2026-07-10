import { useEffect, useState } from 'react'
import type { OllibeuData } from '@shared/types'
import { resolveTheme } from '@shared/theme'
import Greeting from './components/Greeting'
import { quoteForDate } from './quotes'
import './theme.css'

export default function App() {
  const [data, setData] = useState<OllibeuData | null>(null)
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    window.ollibeu.loadData().then(setData)
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(tick)
  }, [])

  const night = data ? resolveTheme(now, data.settings) === 'night' : false
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
  }, [night])

  function update(fn: (d: OllibeuData) => OllibeuData): void {
    setData((prev) => {
      if (!prev) return prev
      const next = fn(prev)
      void window.ollibeu.saveData(next)
      return next
    })
  }
  void update // used from Task 7 onward

  if (!data) return null

  return (
    <>
      <Greeting
        name={data.settings.displayName}
        now={now}
        night={night}
        quote={data.settings.quotesEnabled ? quoteForDate(now) : null}
      />
      <main className="layout">
        <div className="focus-column">{/* JustOneThing + TaskList land in Tasks 7–8 */}</div>
        {/* TodayRail lands in Task 9 */}
      </main>
    </>
  )
}
