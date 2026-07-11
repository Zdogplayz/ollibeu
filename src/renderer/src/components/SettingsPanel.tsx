import type { Settings } from '@shared/types'

export default function SettingsPanel(props: {
  settings: Settings
  onChange: (patch: Partial<Settings>) => void
  onClose: () => void
}) {
  const s = props.settings
  return (
    <div className="settings-overlay" role="dialog" aria-label="Settings">
      <div className="settings-panel card">
        <div className="settings-head">
          <div className="section-label">Settings</div>
          <button type="button" className="pill-button quiet" onClick={props.onClose}>
            done
          </button>
        </div>
        <label className="settings-row">
          <span>Your name</span>
          <input
            type="text"
            value={s.displayName}
            placeholder="what should we call you?"
            onChange={(e) => props.onChange({ displayName: e.target.value })}
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
                  idleDing: { ...s.idleDing, thresholdMinutes: Math.max(3, Number(e.target.value) || 10) }
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
      </div>
    </div>
  )
}
