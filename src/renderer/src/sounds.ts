let ctx: AudioContext | null = null
function audioContext(): AudioContext {
  if (!ctx || ctx.state === 'closed') ctx = new AudioContext()
  return ctx
}

export function playChime(kind: 'win' | 'ding'): void {
  try {
    const ctx = audioContext()
    const notes = kind === 'win' ? [523.25, 783.99] : [659.25]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = ctx.currentTime + i * 0.12
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(kind === 'win' ? 0.12 : 0.07, t0 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.6)
      osc.connect(gain).connect(ctx.destination)
      osc.start(t0)
      osc.stop(t0 + 0.65)
    })
  } catch {
    // sound is a nicety, never an error
  }
}
