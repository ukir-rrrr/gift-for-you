export type PadKey = 'left' | 'right' | 'jump'

export type PadState = Record<PadKey, boolean>

type Hit = { key: PadKey; node: HTMLElement }

/**
 * On-screen pad. Every pointer is captured by the pad root and re-hit-tested on
 * each move, so a thumb sliding from 左 to 右 switches keys and sliding off a
 * button releases it. Each pointer owns at most one key, so move + jump work
 * with two thumbs.
 */
export class VirtualPad {
  readonly state: PadState = { left: false, right: false, jump: false }
  private owners = new Map<number, PadKey | null>()
  private hits: Hit[]

  constructor(
    private root: HTMLElement,
    private onChange: (key: PadKey, down: boolean) => void,
  ) {
    this.hits = Array.from(root.querySelectorAll<HTMLElement>('[data-pad]')).map((node) => ({
      key: node.dataset.pad as PadKey,
      node,
    }))
    root.addEventListener('pointerdown', this.down)
    root.addEventListener('pointermove', this.move)
    root.addEventListener('pointerup', this.up)
    root.addEventListener('pointercancel', this.up)
    root.addEventListener('lostpointercapture', this.up)
    root.addEventListener('contextmenu', (event) => event.preventDefault())
    window.addEventListener('blur', () => this.releaseAll())
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.releaseAll()
    })
  }

  releaseAll() {
    for (const id of [...this.owners.keys()]) this.assign(id, null)
    this.owners.clear()
  }

  private keyAt(x: number, y: number): PadKey | null {
    for (const hit of this.hits) {
      const rect = hit.node.getBoundingClientRect()
      if (x >= rect.left && x < rect.right && y >= rect.top && y < rect.bottom) return hit.key
    }
    return null
  }

  private assign(pointerId: number, key: PadKey | null) {
    const before = this.owners.get(pointerId) ?? null
    if (before === key) return
    this.owners.set(pointerId, key)
    for (const changed of [before, key]) {
      if (!changed) continue
      const down = [...this.owners.values()].includes(changed)
      if (down === this.state[changed]) continue
      this.state[changed] = down
      for (const hit of this.hits) if (hit.key === changed) hit.node.classList.toggle('is-down', down)
      this.onChange(changed, down)
    }
  }

  private down = (event: PointerEvent) => {
    event.preventDefault()
    const key = this.keyAt(event.clientX, event.clientY)
    if (!key) return
    try {
      this.root.setPointerCapture(event.pointerId)
    } catch {
      // synthetic pointers may not be capturable; moves still arrive while over the pad
    }
    this.assign(event.pointerId, key)
  }

  private move = (event: PointerEvent) => {
    if (!this.owners.has(event.pointerId)) return
    this.assign(event.pointerId, this.keyAt(event.clientX, event.clientY))
  }

  private up = (event: PointerEvent) => {
    if (!this.owners.has(event.pointerId)) return
    this.assign(event.pointerId, null)
    this.owners.delete(event.pointerId)
  }
}
