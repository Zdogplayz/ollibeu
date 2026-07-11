import { useEffect, useState } from 'react'
import type { GoogleStatus } from '@shared/types'

export default function TodayRail(props: {
  night: boolean
  google: GoogleStatus
  onConnect: () => void
}) {
  const [copied, setCopied] = useState(false)

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
        <p className="placeholder-copy">
          Google connected{props.google.email ? ` as ${props.google.email}` : ''} ✓ — your
          calendar arrives in the next update.
        </p>
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
