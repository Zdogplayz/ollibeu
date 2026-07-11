import { useState } from 'react'
import type { GoogleStatus, Settings } from '@shared/types'

export default function Onboarding(props: {
  settings: Settings
  google: GoogleStatus
  onChange: (patch: Partial<Settings>) => void
  onConnect: () => void
  onDone: () => void
}) {
  const [step, setStep] = useState(0)
  const [name, setName] = useState(props.settings.displayName)

  const steps = [
    <div key="name" className="onboarding-step">
      <h2>Welcome to Ollibeu 🌿</h2>
      <p>A calm little home for your day. First — what should we call you?</p>
      <input
        type="text"
        autoFocus
        placeholder="your name (or skip — that’s fine too)"
        aria-label="Your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') next()
        }}
      />
    </div>,
    <div key="google" className="onboarding-step">
      <h2>Bring your calendar along?</h2>
      <p>
        Connect Google and Ollibeu shows your appointments, gentle get-ready nudges, and your
        Google Tasks — all in one calm place. Totally optional.
      </p>
      {props.google.state === 'connected' ? (
        <p className="onboarding-good">Connected{props.google.email ? ` as ${props.google.email}` : ''} ✓</p>
      ) : props.google.state === 'connecting' ? (
        <p>A browser tab just opened — finish signing in there, then come back. 🌿</p>
      ) : props.google.state === 'unconfigured' ? (
        <p>Google isn’t set up on this build — you can add it later in settings. No worries.</p>
      ) : (
        <button type="button" className="pill-button" onClick={props.onConnect}>
          Connect Google
        </button>
      )}
    </div>,
    <div key="autostart" className="onboarding-step">
      <h2>Be there when you open your computer?</h2>
      <p>
        Ollibeu works best when it greets you at startup — your day is already laid out before
        distractions arrive.
      </p>
      <label className="onboarding-toggle">
        <input
          type="checkbox"
          checked={props.settings.launchAtLogin}
          onChange={(e) => props.onChange({ launchAtLogin: e.target.checked })}
        />
        <span>Open Ollibeu when the computer starts</span>
      </label>
    </div>
  ]

  function next(): void {
    if (step === 0 && name.trim() !== props.settings.displayName) {
      props.onChange({ displayName: name.trim() })
    }
    if (step < steps.length - 1) setStep(step + 1)
    else props.onDone()
  }

  return (
    <div className="onboarding-overlay">
      <div className="onboarding-card card">
        {steps[step]}
        <div className="onboarding-nav">
          <div className="onboarding-dots" aria-hidden="true">
            {steps.map((_, i) => (
              <span key={i} className={i === step ? 'dot active' : 'dot'} />
            ))}
          </div>
          <div className="onboarding-buttons">
            {step > 0 && (
              <button type="button" className="pill-button quiet" onClick={() => setStep(step - 1)}>
                back
              </button>
            )}
            <button type="button" className="pill-button" onClick={next}>
              {step < steps.length - 1 ? 'next →' : 'let’s go 🌿'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
