import type { Cue } from './cues'

// Two-bar loop in C major: melody over a soft bass, 0.24 s per step.
const MELODY = [523, 0, 659, 0, 784, 659, 587, 0, 523, 0, 587, 659, 523, 0, 392, 0]
const BASS = [131, 0, 0, 0, 175, 0, 0, 0, 196, 0, 0, 0, 131, 0, 0, 0]
const STEP = 0.24

type Note = { freq: number; at: number; len: number; type: OscillatorType; gain: number }

export type Sfx = Cue | 'open' | 'type'

const SFX: Record<Sfx, Omit<Note, 'at'>[]> = {
  jump: [{ freq: 440, len: 0.08, type: 'square', gain: 0.03 }, { freq: 660, len: 0.06, type: 'square', gain: 0.025 }],
  coin: [{ freq: 988, len: 0.07, type: 'square', gain: 0.03 }, { freq: 1319, len: 0.18, type: 'square', gain: 0.03 }],
  miss: [{ freq: 330, len: 0.12, type: 'triangle', gain: 0.05 }, { freq: 220, len: 0.2, type: 'triangle', gain: 0.05 }],
  stomp: [{ freq: 196, len: 0.06, type: 'square', gain: 0.035 }, { freq: 392, len: 0.08, type: 'square', gain: 0.03 }],
  goal: [
    { freq: 523, len: 0.12, type: 'triangle', gain: 0.05 },
    { freq: 659, len: 0.12, type: 'triangle', gain: 0.05 },
    { freq: 784, len: 0.3, type: 'triangle', gain: 0.05 },
  ],
  open: [
    { freq: 784, len: 0.1, type: 'square', gain: 0.03 },
    { freq: 988, len: 0.1, type: 'square', gain: 0.03 },
    { freq: 1175, len: 0.1, type: 'square', gain: 0.03 },
    { freq: 1568, len: 0.4, type: 'triangle', gain: 0.04 },
  ],
  type: [{ freq: 1760, len: 0.02, type: 'square', gain: 0.008 }],
}

/** Web Audio chiptune: one looping BGM plus short effects. Nothing plays before a user tap unlocks it. */
export class Music {
  private ctx: AudioContext | null = null
  private muted = false
  private timer = 0
  private step = 0
  private unlocked = false
  private bgm = true

  constructor(muted = false) {
    this.muted = muted
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return
      if (document.hidden) void this.ctx.suspend()
      else if (this.unlocked) void this.ctx.resume()
    })
  }

  unlock() {
    this.unlocked = true
    try {
      this.ctx = this.ctx ?? new window.AudioContext()
      if (this.ctx.state === 'suspended') void this.ctx.resume()
    } catch {
      this.ctx = null
    }
  }

  toggle() {
    this.muted = !this.muted
    return this.muted
  }

  get isMuted() {
    return this.muted
  }

  /** The loop stops for the letter so the reading is quiet. */
  setBgm(on: boolean) {
    this.bgm = on
  }

  private tone(note: Note) {
    const ctx = this.ctx
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = ctx.currentTime + note.at
    osc.type = note.type
    osc.frequency.value = note.freq
    gain.gain.setValueAtTime(note.gain, start)
    gain.gain.exponentialRampToValueAtTime(0.0005, start + note.len)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(start)
    osc.stop(start + note.len + 0.02)
  }

  play(sfx: Sfx) {
    if (!this.unlocked || this.muted || !this.ctx) return
    let at = 0
    for (const note of SFX[sfx]) {
      this.tone({ ...note, at })
      at += note.len * 0.8
    }
  }

  update(dt: number) {
    if (!this.unlocked || this.muted || !this.ctx || !this.bgm) return
    this.timer += dt
    if (this.timer < STEP) return
    this.timer = 0
    const i = this.step % MELODY.length
    this.step += 1
    if (MELODY[i]) this.tone({ freq: MELODY[i], at: 0, len: 0.2, type: 'triangle', gain: 0.02 })
    if (BASS[i]) this.tone({ freq: BASS[i], at: 0, len: 0.6, type: 'sine', gain: 0.03 })
  }
}
