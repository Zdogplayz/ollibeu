import { useEffect, useRef, useState } from 'react'
import type { GoogleStatus, Settings } from '@shared/types'
import GoogleSetup from './GoogleSetup'

export default function SettingsPanel(props: {
  settings: Settings
  google: GoogleStatus
  onChange: (patch: Partial<Settings>) => void
  onConnect: () => void
  onDisconnect: () => void
  onResetGoogle: () => void
  onClose: () => void
}) {
  const s = props.settings
  const [name, setName] = useState(props.settings.displayName)
  const doneRef = useRef<HTMLButtonElement>(null)

  function commitAndClose(): void {
    if (name !== props.settings.displayName) props.onChange({ displayName: name })
    props.onClose()
  }

  useEffect(() => {
    doneRef.current?.focus()
  }, [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') commitAndClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  return (
    <div
      className="settings-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) commitAndClose()
      }}
    >
      <div className="settings-panel card" role="dialog" aria-modal="true" aria-label="Settings">
        <div className="settings-head">
          <div className="section-label">Settings</div>
          <button type="button" className="pill-button quiet" ref={doneRef} onClick={commitAndClose}>
            done
          </button>
        </div>
        <label className="settings-row">
          <span>Your name</span>
          <input
            type="text"
            value={name}
            placeholder="what should we call you?"
            onChange={(e) => setName(e.target.value)}
            onBlur={() => {
              if (name !== props.settings.displayName) props.onChange({ displayName: name })
            }}
          />
        </label>
        <label className="settings-row">
          <span>Theme</span>
          <select
            value={s.theme}
            onChange={(e) => props.onChange({ theme: e.target.value as Settings['theme'] })}
          >
            <option value="auto">day &amp; night (auto)</option>
            <option value="day">always day</option>
            <option value="night">always night</option>
          </select>
        </label>
        <label className="settings-row">
          <span>Gentle sounds</span>
          <input
            type="checkbox"
            checked={s.soundsEnabled}
            onChange={(e) => props.onChange({ soundsEnabled: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          <span>Nudge me when I drift</span>
          <input
            type="checkbox"
            checked={s.idleDing.enabled}
            onChange={(e) => props.onChange({ idleDing: { ...s.idleDing, enabled: e.target.checked } })}
          />
        </label>
        {s.idleDing.enabled && (
          <label className="settings-row">
            <span>after this many quiet minutes</span>
            <input
              type="number"
              min={3}
              max={120}
              value={s.idleDing.thresholdMinutes}
              onChange={(e) =>
                props.onChange({
                  idleDing: {
                    ...s.idleDing,
                    thresholdMinutes: Math.min(120, Math.max(3, Number(e.target.value) || 10))
                  }
                })
              }
            />
          </label>
        )}
        <label className="settings-row">
          <span>Open Ollibeu when the computer starts</span>
          <input
            type="checkbox"
            checked={s.launchAtLogin}
            onChange={(e) => props.onChange({ launchAtLogin: e.target.checked })}
          />
        </label>
        <label className="settings-row">
          <span>Daily quote</span>
          <input
            type="checkbox"
            checked={s.quotesEnabled}
            onChange={(e) => props.onChange({ quotesEnabled: e.target.checked })}
          />
        </label>
        <div className="settings-row settings-google">
          <span>Google</span>
          {props.google.state === 'connected' ? (
            <span className="settings-google-status">
              connected{props.google.email ? ` as ${props.google.email}` : ''}{' '}
              <button type="button" className="link-button" onClick={props.onDisconnect}>
                disconnect
              </button>
            </span>
          ) : props.google.state === 'connecting' ? (
            <span className="settings-google-status">finishing sign-in in your browser…</span>
          ) : props.google.state === 'unconfigured' ? (
            <span className="settings-google-status">needs its setup keys — paste them below</span>
          ) : (
            <button type="button" className="pill-button" onClick={props.onConnect}>
              Connect Google
            </button>
          )}
        </div>
        {props.google.state === 'unconfigured' && <GoogleSetup compact />}
        {props.google.state !== 'unconfigured' && (
          <p className="settings-reset-line">
            Google acting up?{' '}
            <button type="button" className="link-button" onClick={props.onResetGoogle}>
              start Google over
            </button>{' '}
            — clears the saved keys and sign-in.
          </p>
        )}
      </div>
    </div>
  )
}
