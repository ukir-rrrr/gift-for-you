import { solidsAt, type RuntimeCourse } from '@gfy/catalog'
import type { InputState } from './platformer'
import { PHYSICS } from './physics'

export type BotView = {
  x: number
  y: number
  grounded: boolean
  time: number
  atGoal: boolean
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

export function botInput(state: BotView, course: RuntimeCourse, hold: { frames: number }): InputState {
  if (state.atGoal) {
    return { left: false, right: false, jump: false, jumpPressed: false }
  }
  let jump = false
  if (state.grounded) {
    for (let ahead = 4; ahead <= 40; ahead += 2) {
      const top = surfaceAt(course, state.time, state.x + ahead, state.y)
      if (top === null || top > state.y + 24) {
        if (ahead <= 12) jump = true
        break
      }
    }
    const bodyTop = state.y - PHYSICS.height
    if (
      course.hazards.some(
        (hazard) =>
          hazard.x < state.x + 18 && hazard.x + hazard.w > state.x + 2 && hazard.y < state.y && hazard.y + hazard.h > bodyTop,
      )
    ) {
      jump = true
    }
  }
  if (jump) hold.frames = 10
  const jumping = hold.frames > 0
  if (hold.frames > 0) hold.frames -= 1
  return { left: false, right: true, jump: jumping, jumpPressed: jump }
}
