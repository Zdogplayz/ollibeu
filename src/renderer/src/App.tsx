import { useEffect, useRef, useState } from 'react'
import type { Importance, OllibeuData, Task, TaskSortMode, GoogleStatus } from '@shared/types'
import { resolveTheme } from '@shared/theme'
import { completedTodayCount, finishedLabel } from '@shared/dayText'
import { pickOneThing } from '@shared/pickOne'
import { sortTasks } from '@shared/taskSort'
import Greeting from './components/Greeting'
import TaskList from './components/TaskList'
import AddTask from './components/AddTask'
import JustOneThing from './components/JustOneThing'
import TodayRail from './components/TodayRail'
import SettingsPanel from './components/SettingsPanel'
import Onboarding from './components/Onboarding'
import { quoteForDate } from './quotes'
import { playChime } from './sounds'
import './theme.css'

export default function App() {
  const [data, setData] = useState<OllibeuData | null>(null)
  const [now, setNow] = useState(() => new Date())
  const [loadTrouble, setLoadTrouble] = useState(false)
  const [saveTrouble, setSaveTrouble] = useState(false)
  const [google, setGoogle] = useState<GoogleStatus>({ state: 'disconnected' })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [showFinished, setShowFinished] = useState(false)

  const dataRef = useRef<OllibeuData | null>(null)
  useEffect(() => {
    dataRef.current = data
  }, [data])

  useEffect(() => {
    let cancelled = false
    window.ollibeu
      .getData()
      .then((d) => {
        if (!cancelled) setData(d)
      })
      .catch(() => {
        if (!cancelled) setLoadTrouble(true)
      })
    const offData = window.ollibeu.onDataChanged((d) => setData(d))
    const offTrouble = window.ollibeu.onSaveTrouble(setSaveTrouble)
    void window.ollibeu.getSaveTrouble().then(setSaveTrouble).catch(() => {})
    void window.ollibeu.google.status().then(setGoogle)
    const offGoogle = window.ollibeu.onGoogleStatusChanged(setGoogle)
    const offDing = window.ollibeu.onIdleDing(() => {
      if (dataRef.current?.settings.soundsEnabled) playChime('ding')
    })
    return () => {
      cancelled = true
      offData()
      offTrouble()
      offGoogle()
      offDing()
    }
  }, [])

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(tick)
  }, [])

  const night = data ? resolveTheme(now, data.settings) === 'night' : false
  useEffect(() => {
    document.documentElement.dataset.theme = night ? 'night' : 'day'
  }, [night])

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
    void window.ollibeu.mutate.addTask(task)
  }

  function completeTask(id: string): void {
    window.clearTimeout(doneTimer.current)
    setJustDoneId(id)
    if (data?.settings.soundsEnabled) playChime('win')
    void window.ollibeu.mutate.completeTask(id, new Date().toISOString())
    doneTimer.current = window.setTimeout(() => setJustDoneId(null), 850)
  }

  const pinnedTask = data?.tasks.find(
    (t) => t.id === data.appState.activeTaskId && !t.completedAt
  )
  const oneThing = data ? pinnedTask ?? pickOneThing(data.tasks, now, shuffledAway) : null

  function startOneThing(id: string): void {
    void window.ollibeu.mutate.setAppState({ activeTaskId: id })
  }

  function togglePin(id: string): void {
    void window.ollibeu.mutate.setAppState({
      activeTaskId: pinnedTask?.id === id ? undefined : id
    })
  }

  function shuffleOneThing(id: string): void {
    const nextExcluded = [...shuffledAway, id]
    const nextPick = data ? pickOneThing(data.tasks, now, nextExcluded) : null
    setShuffledAway(nextPick ? nextExcluded : [])
    if (pinnedTask?.id === id) void window.ollibeu.mutate.setAppState({ activeTaskId: undefined })
  }

  if (!data) {
    return loadTrouble ? (
      <p className="empty-hint" style={{ textAlign: 'center', marginTop: '40vh' }}>
        Ollibeu couldn’t read its notes just now. Nothing has been changed — closing and
        reopening usually clears it up. 🌿
      </p>
    ) : null
  }

  // The one-thing card is a spotlight, not a removal — every open task stays in the list
  const openTasks = sortTasks(
    data.tasks.filter((t) => !t.completedAt || t.id === justDoneId),
    data.settings.taskSort,
    now
  )
  const wins = completedTodayCount(data.tasks, now)
  const finishedTasks = data.tasks
    .filter((t) => t.completedAt && t.id !== justDoneId)
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
    .slice(0, 30)

  function setTaskSort(mode: TaskSortMode): void {
    void window.ollibeu.mutate.setSettings({ taskSort: mode })
  }

  return (
    <>
      <button
        type="button"
        className="settings-button"
        aria-label="Settings"
        onClick={() => setSettingsOpen(true)}
      >
        ⚙
      </button>
      {settingsOpen && (
        <SettingsPanel
          settings={data.settings}
          google={google}
          onChange={(patch) => void window.ollibeu.mutate.setSettings(patch)}
          onConnect={() => void window.ollibeu.google.connect().catch(() => {})}
          onDisconnect={() => void window.ollibeu.google.disconnect().catch(() => {})}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {!data.settings.onboarded && (
        <Onboarding
          settings={data.settings}
          google={google}
          onChange={(patch) => void window.ollibeu.mutate.setSettings(patch)}
          onConnect={() => void window.ollibeu.google.connect().catch(() => {})}
          onDone={() => void window.ollibeu.mutate.setSettings({ onboarded: true })}
        />
      )}
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
          <div className="list-header">
            <div className="section-label">The rest — no rush</div>
            <div className="sort-toggle" role="group" aria-label="Sort tasks by">
              <button
                type="button"
                className={data.settings.taskSort === 'importance' ? 'active' : ''}
                onClick={() => setTaskSort('importance')}
              >
                importance
              </button>
              <button
                type="button"
                className={data.settings.taskSort === 'soonest' ? 'active' : ''}
                onClick={() => setTaskSort('soonest')}
              >
                soonest
              </button>
            </div>
          </div>
          <TaskList
            tasks={openTasks}
            justDoneId={justDoneId}
            pinnedId={pinnedTask?.id ?? null}
            now={now}
            onComplete={completeTask}
            onTogglePin={togglePin}
          />
          <AddTask onAdd={addTask} />
        </div>
        <TodayRail
          night={night}
          google={google}
          onConnect={() => void window.ollibeu.google.connect().catch(() => {})}
          calendar={data.calendar}
          leaveByBufferMinutes={data.settings.leaveByBufferMinutes}
          now={now}
          onAddEvent={(input) => window.ollibeu.calendar.addEvent(input)}
          onReauth={() =>
            void window.ollibeu.google
              .disconnect()
              .then(() => window.ollibeu.google.connect())
              .catch(() => {})
          }
        />
      </main>
      {(wins > 0 || finishedTasks.length > 0) && (
        <div className="win-line">
          {wins > 0 && (
            <>
              {wins} {wins === 1 ? 'thing' : 'things'} today ✨{' · '}
            </>
          )}
          <button type="button" className="link-button" onClick={() => setShowFinished((v) => !v)}>
            {showFinished ? 'hide finished' : 'see finished'}
          </button>
        </div>
      )}
      {showFinished && finishedTasks.length > 0 && (
        <ul className="finished-list">
          {finishedTasks.map((t) => (
            <li key={t.id} className="finished-row">
              <span className="check filled" aria-hidden="true" />
              <span className="finished-title">{t.title}</span>
              <span className="due-chip">{finishedLabel(t.completedAt ?? '', now)}</span>
            </li>
          ))}
        </ul>
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
