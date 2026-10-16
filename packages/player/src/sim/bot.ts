import { solidsAt, walkerX, type RuntimeCourse } from '@gfy/catalog'
import type { InputState } from './platformer'
import { PHYSICS } from './physics'

export type BotView = {
  x: number
  y: number
  grounded: boolean
  time: number
  atGoal: boolean
  stomped: readonly string[]
  assist: 'none' | 'offered' | 'invincible' | 'float'
}

function surfaceAt(course: RuntimeCourse, time: number, x: number, footY: number): number | null {
  let best: number | null = null
  for (const solid of solidsAt(course, time)) {
    if (x <= solid.x || x >= solid.x + solid.w) continue
    if (solid.y > footY + 36) continue
    if (best === null || solid.y < best) best = solid.y
  }
  return best
}

function overlapsBody(state: BotView, y: number, h: number): boolean {
  const bodyTop = state.y - PHYSICS.height
  return y < state.y && y + h > bodyTop
}

export function botInput(state: BotView, course: RuntimeCourse, hold: { frames: number }): InputState {
  if (state.atGoal) {
    return { left: false, right: false, jump: false, jumpPressed: false }
  }
  let jump = false
  if (state.grounded) {
    for (let ahead = 4; ahead <= 44; ahead += 2) {
      const top = surfaceAt(course, state.time, state.x + ahead, state.y)
      if (top === null || top > state.y + 24) {
        if (ahead <= 22) jump = true
        break
      }
      if (top < state.y - 6 && ahead <= 24) {
        jump = true
        break
      }
    }
    if (
      course.hazards.some((hazard) => {
        if (!overlapsBody(state, hazard.y, hazard.h)) return false
        const lead = hazard.x - state.x
        return lead > 12 && lead <= 20
      })
    ) {
      jump = true
    }
    if (
      course.walkers.some((walker) => {
        if (state.stomped.includes(walker.id)) return false
        const x = walkerX(walker, state.time)
        const lead = x - state.x
        return lead > 10 && lead <= 18
      })
    ) {
      jump = true
    }
  }
  if (jump) hold.frames = 16
  const jumping = hold.frames > 0
  if (hold.frames > 0) hold.frames -= 1
  return { left: false, right: true, jump: jumping, jumpPressed: jump }
}
