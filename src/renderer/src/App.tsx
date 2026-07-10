import { useEffect, useRef, useState } from 'react'
import type { Importance, OllibeuData, Task } from '@shared/types'
import { resolveTheme } from '@shared/theme'
import { completedTodayCount } from '@shared/dayText'
import Greeting from './components/Greeting'
import TaskList from './components/TaskList'
import AddTask from './components/AddTask'
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

  const hydrated = useRef(false)
  useEffect(() => {
    if (!data) return
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    void window.ollibeu.saveData(data)
  }, [data])

  function update(fn: (d: OllibeuData) => OllibeuData): void {
    setData((prev) => (prev ? fn(prev) : prev))
  }

  const [justDoneId, setJustDoneId] = useState<string | null>(null)

  function addTask(title: string, importance: Importance): void {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      importance,
      source: 'local',
      createdAt: new Date().toISOString()
    }
    update((d) => ({ ...d, tasks: [...d.tasks, task] }))
  }

  function completeTask(id: string): void {
    setJustDoneId(id)
    update((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, completedAt: new Date().toISOString() } : t)),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
    setTimeout(() => setJustDoneId(null), 500)
  }

  if (!data) return null

  const openTasks = data.tasks.filter((t) => !t.completedAt)
  const wins = completedTodayCount(data.tasks, now)

  return (
    <>
      <Greeting
        name={data.settings.displayName}
        now={now}
        night={night}
        quote={data.settings.quotesEnabled ? quoteForDate(now) : null}
      />
      <main className="layout">
        <div className="focus-column">
          <div className="section-label">The rest — no rush</div>
          <TaskList tasks={openTasks} justDoneId={justDoneId} onComplete={completeTask} />
          <AddTask onAdd={addTask} />
        </div>
        {/* TodayRail lands in Task 9 */}
      </main>
      {wins > 0 && (
        <div className="win-line">
          {wins} {wins === 1 ? 'thing' : 'things'} today ✨
        </div>
      )}
    </>
  )
}
