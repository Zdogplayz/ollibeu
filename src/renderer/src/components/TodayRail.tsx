import { useEffect, useState } from 'react'
import { eventsForDay, leaveByLabel, tomorrowPeek } from '@shared/gcal'
import type { AddEventInput, AddEventResult, CalendarCache, GoogleStatus } from '@shared/types'
import AddEvent from './AddEvent'

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function TodayRail(props: {
  night: boolean
  google: GoogleStatus
  onConnect: () => void
  calendar?: CalendarCache
  leaveByBufferMinutes: number
  now: Date
  onAddEvent: (input: AddEventInput) => Promise<AddEventResult>
  onReauth: () => void
}) {
  const [copied, setCopied] = useState(false)

  const events = props.calendar?.events ?? []
  const todayEvents = eventsForDay(events, props.now)

  // A fresh link (or leaving the connecting state) resets the copied marker
  useEffect(() => {
    setCopied(false)
  }, [props.google.connectUrl])

  function copyConnectLink(): void {
    if (!props.google.connectUrl) return
    void navigator.clipboard
      ?.writeText(props.google.connectUrl)
      .then(() => setCopied(true))
      .catch(() => setCopied(false))
  }

  return (
    <aside className="today-rail">
      <div className="section-label">Today</div>
      {props.google.state === 'connected' ? (
        <>
          <div className="rail-timeline">
            {todayEvents.length === 0 ? (
              <p className="placeholder-copy">Nothing on the calendar today 🍃</p>
            ) : (
              todayEvents.map((e) => {
                const started = !e.allDay && new Date(e.start) <= props.now
                const leaveBy = leaveByLabel(e, props.leaveByBufferMinutes, props.now)
                return (
                  <div key={e.id} className={`rail-event${started ? ' started' : ''}`}>
                    <div className="rail-time">
                      {e.allDay
                        ? 'all day'
                        : new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </div>
                    <div className="rail-event-title">{e.title}</div>
                    {leaveBy && <div className="rail-leave-by">{leaveBy}</div>}
                  </div>
                )
              })
            )}
          </div>
          <p className="rail-tomorrow">{tomorrowPeek(events, props.now)}</p>
          {props.calendar && (
            <p className="rail-synced">
              synced{' '}
              {new Date(props.calendar.lastSyncedAt).toLocaleTimeString(undefined, {
                hour: 'numeric',
                minute: '2-digit'
              })}
            </p>
          )}
          <AddEvent onAdd={props.onAddEvent} onReauth={props.onReauth} today={toDateStr(props.now)} />
        </>
      ) : props.google.state === 'connecting' ? (
        <>
          <p className="placeholder-copy">
            A browser tab just opened — finish signing in there. 🌿
          </p>
          {props.google.connectUrl && (
            <p className="placeholder-copy">
              Nothing opened?{' '}
              <button type="button" className="link-button" onClick={copyConnectLink}>
                {copied ? 'link copied ✓' : 'copy the sign-in link'}
              </button>{' '}
              and paste it into any browser.
            </p>
          )}
        </>
      ) : props.google.state === 'unconfigured' ? (
        <p className="placeholder-copy">
          Google isn't set up on this build yet — the person who installed Ollibeu can add the
          key. Everything else works without it.
        </p>
      ) : (
        <>
          <p className="placeholder-copy">
            Connect Google to see your day here — appointments, gentle "leave by" nudges, and
            what tomorrow looks like.
          </p>
          <button type="button" className="pill-button" onClick={props.onConnect}>
            Connect Google
          </button>
          {props.google.state === 'needs_reconnect' && (
            <p className="placeholder-copy">
              Google asked us to sign in again — one click and you're set. 🍃
            </p>
          )}
        </>
      )}
      <p className="placeholder-copy">
        {props.night ? 'Rest is productive too. ✨' : 'One thing at a time. 🍃'}
      </p>
    </aside>
  )
}
