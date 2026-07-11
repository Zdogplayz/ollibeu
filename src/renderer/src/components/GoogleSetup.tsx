import { useState } from 'react'

/**
 * Shown when a build has no Google key yet: paste the two values from the
 * Google Cloud "Desktop app" OAuth client and the app stores them itself.
 */
export default function GoogleSetup(props: { compact?: boolean }) {
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [trouble, setTrouble] = useState(false)

  function save(): void {
    const id = clientId.trim()
    if (!id || busy) return
    setBusy(true)
    setTrouble(false)
    void window.ollibeu.google
      .setConfig({ clientId: id, ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}) })
      .then((status) => {
        if (status.state === 'unconfigured') setTrouble(true)
      })
      .catch(() => setTrouble(true))
      .finally(() => setBusy(false))
  }

  return (
    <div className="google-setup">
      {!props.compact && (
        <p className="placeholder-copy">
          Have the two Google keys from whoever set up Ollibeu? Paste them here once — a
          Connect Google button appears right after. Or skip this and add them any time in
          settings.
        </p>
      )}
      <input
        type="text"
        placeholder="client ID (ends in .apps.googleusercontent.com)"
        aria-label="Google client ID"
        value={clientId}
        onChange={(e) => setClientId(e.target.value)}
      />
      <input
        type="text"
        placeholder="client secret"
        aria-label="Google client secret"
        value={clientSecret}
        onChange={(e) => setClientSecret(e.target.value)}
      />
      <button type="button" className="pill-button" disabled={busy || !clientId.trim()} onClick={save}>
        {busy ? 'saving…' : 'save keys'}
      </button>
      {trouble && (
        <p className="placeholder-copy">
          That didn’t quite take — worth double-checking the keys and trying again. 🍃
        </p>
      )}
    </div>
  )
}
