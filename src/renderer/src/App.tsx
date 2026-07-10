import { useEffect, useRef, useState } from 'react'
import type { Importance, OllibeuData, Task } from '@shared/types'
import { resolveTheme } from '@shared/theme'
import { completedTodayCount } from '@shared/dayText'
import { pickOneThing } from '@shared/pickOne'
import Greeting from './components/Greeting'
import TaskList from './components/TaskList'
import AddTask from './components/AddTask'
import JustOneThing from './components/JustOneThing'
import TodayRail from './components/TodayRail'
import { quoteForDate } from './quotes'
import './theme.css'

export default function App() {
  const [data, setData] = useState<OllibeuData | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [loadTrouble, setLoadTrouble] = useState(false)

  useEffect(() => {
    window.ollibeu.loadData().then(setData).catch(() => setLoadTrouble(true))
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
  const [saveTrouble, setSaveTrouble] = useState(false)
  useEffect(() => {
    if (!data) return
    if (!hydrated.current) {
      hydrated.current = true
      return
    }
    window.ollibeu
      .saveData(data)
      .then(() => setSaveTrouble(false))
      .catch(() => setSaveTrouble(true))
  }, [data])

  function update(fn: (d: OllibeuData) => OllibeuData): void {
    setData((prev) => (prev ? fn(prev) : prev))
  }

  const [justDoneId, setJustDoneId] = useState<string | null>(null)
  const doneTimer = useRef<number | undefined>(undefined)

  const [shuffledAway, setShuffledAway] = useState<string[]>([])

  function addTask(title: string, importance: Importance, dueDate?: string, dueTime?: string): void {
    const task: Task = {
      id: crypto.randomUUID(),
      title,
      importance,
      source: 'local',
      createdAt: new Date().toISOString(),
      ...(dueDate ? { dueDate } : {}),
      ...(dueTime ? { dueTime } : {})
    }
    update((d) => ({ ...d, tasks: [...d.tasks, task] }))
  }

  function completeTask(id: string): void {
    window.clearTimeout(doneTimer.current)
    setJustDoneId(id)
    update((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === id ? { ...t, completedAt: new Date().toISOString() } : t)),
      appState: d.appState.activeTaskId === id ? {} : d.appState
    }))
    doneTimer.current = window.setTimeout(() => setJustDoneId(null), 500)
  }

  const pinnedTask = data?.tasks.find(
    (t) => t.id === data.appState.activeTaskId && !t.completedAt
  )
  const oneThing = data ? pinnedTask ?? pickOneThing(data.tasks, now, shuffledAway) : null

  function startOneThing(id: string): void {
    update((d) => ({ ...d, appState: { ...d.appState, activeTaskId: id } }))
  }

  function shuffleOneThing(id: string): void {
    const nextExcluded = [...shuffledAway, id]
    const nextPick = data ? pickOneThing(data.tasks, now, nextExcluded) : null
    setShuffledAway(nextPick ? nextExcluded : [])
    if (pinnedTask?.id === id) update((d) => ({ ...d, appState: {} }))
  }

  if (!data) {
    return loadTrouble ? (
      <p className="empty-hint" style={{ textAlign: 'center', marginTop: '40vh' }}>
        Ollibeu couldn’t read its notes just now. Nothing has been changed — closing and
        reopening usually clears it up. 🌿
      </p>
    ) : null
  }

  const suggestedUnpinnedId = pinnedTask ? null : (oneThing?.id ?? null)
  const openTasks = data.tasks.filter(
    (t) => (!t.completedAt || t.id === justDoneId) && t.id !== suggestedUnpinnedId
  )
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
          {oneThing && (
            <JustOneThing
              task={oneThing}
              pinned={pinnedTask?.id === oneThing.id}
              onStart={() => startOneThing(oneThing.id)}
              onShuffle={() => shuffleOneThing(oneThing.id)}
              onComplete={() => completeTask(oneThing.id)}
            />
          )}
          <div className="section-label">The rest — no rush</div>
          <TaskList
            tasks={openTasks}
            justDoneId={justDoneId}
            pinnedId={pinnedTask?.id ?? null}
            now={now}
            onComplete={completeTask}
          />
          <AddTask onAdd={addTask} />
        </div>
        <TodayRail night={night} />
      </main>
      {wins > 0 && (
        <div className="win-line">
          {wins} {wins === 1 ? 'thing' : 'things'} today ✨
        </div>
      )}
      {saveTrouble && (
        <div className="win-line">
          Having a little trouble saving just now — your list is safe on screen, and I’ll try
          again with your next change. 🍃
        </div>
      )}
    </>
  )
}
