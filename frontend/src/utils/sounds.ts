/**
 * Web Audio API sound effects — no external files needed.
 * AudioContext is created lazily on first user interaction.
 */

let ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(
  freq: number,
  duration: number,
  type: OscillatorType = 'square',
  volume = 0.22,
  startOffset = 0,
) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, c.currentTime + startOffset)
  gain.gain.setValueAtTime(volume, c.currentTime + startOffset)
  gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + startOffset + duration)
  osc.start(c.currentTime + startOffset)
  osc.stop(c.currentTime + startOffset + duration)
}

export const sounds = {
  /** Carta jugada: click corto */
  playCard: () => tone(440, 0.1),

  /** Robar carta: tono suave descendente */
  drawCard: () => {
    tone(300, 0.08, 'sine', 0.18)
    tone(260, 0.1, 'sine', 0.15, 0.08)
  },

  /** ¡UNO! fanfare ascendente */
  uno: () => {
    tone(523, 0.08)
    tone(659, 0.08, 'square', 0.22, 0.1)
    tone(784, 0.15, 'square', 0.25, 0.2)
  },

  /** Penalización (+2/+4 acumulado) */
  penalty: () => {
    tone(200, 0.12, 'sawtooth', 0.2)
    tone(160, 0.18, 'sawtooth', 0.18, 0.12)
  },

  /** Victoria */
  win: () => {
    const melody = [523, 659, 784, 1047]
    melody.forEach((f, i) => tone(f, 0.18, 'square', 0.22, i * 0.14))
  },

  /** Derrota */
  lose: () => {
    tone(300, 0.12, 'sawtooth', 0.2)
    tone(220, 0.15, 'sawtooth', 0.18, 0.15)
    tone(180, 0.3, 'sawtooth', 0.15, 0.32)
  },
}
