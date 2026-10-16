const NOTES = [262, 294, 330, 349, 330, 294]

export class Music {
  private ctx: AudioContext | null = null
  private muted = false
  private timer = 0
  private step = 0
  private unlocked = false

  unlock() {
    this.unlocked = true
    const AudioCtx = window.AudioContext
    this.ctx = this.ctx ?? new AudioCtx()
    if (this.ctx.state === 'suspended') void this.ctx.resume()
  }

  toggle() {
    this.muted = !this.muted
    return this.muted
  }

  get isMuted() {
    return this.muted
  }

  update(dt: number) {
    if (!this.unlocked || this.muted || !this.ctx) return
    this.timer += dt
    if (this.timer < 0.48) return
    this.timer = 0
    const osc = this.ctx.createOscillator()
    const gain = this.ctx.createGain()
    osc.type = 'triangle'
    osc.frequency.value = NOTES[this.step % NOTES.length]
    this.step += 1
    gain.gain.setValueAtTime(0.018, this.ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.36)
    osc.connect(gain)
    gain.connect(this.ctx.destination)
    osc.start()
    osc.stop(this.ctx.currentTime + 0.38)
  }
}
