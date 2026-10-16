import { moversOf, oscillatorX, solidsAt, type RuntimeCourse } from '@gfy/catalog'
import type { InputState, Snapshot } from './platformer'
import { PHYSICS } from './physics'

function surfaceAt(course: RuntimeCourse, time: number, x: number, footY: number): number | null {
  let best: number | null = null
  for (const solid of solidsAt(course, time)) {
    if (x <= solid.x || x >= solid.x + solid.w) continue
    if (solid.y > footY + 36) continue
    if (best === null || solid.y < best) best = solid.y
  }
  return best
}

function overlapsBody(state: Snapshot, y: number, h: number): boolean {
  const bodyTop = state.y - PHYSICS.height
  return y < state.y && y + h > bodyTop
}

function inLead(x: number, from: number, min: number, max: number): boolean {
  const lead = x - from
  return lead > min && lead <= max
}

export function botInput(state: Snapshot, course: RuntimeCourse, hold: { frames: number }): InputState {
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
      course.hazards.some(
        (hazard) => overlapsBody(state, hazard.y, hazard.h) && inLead(hazard.x, state.x, 12, 20),
      )
    ) {
      jump = true
    }
    if (
      moversOf(course, 'stompable').some((walker) => {
        if (state.stomped.includes(walker.id)) return false
        const x = oscillatorX(walker, state.time)
        return overlapsBody(state, walker.y, walker.h) && inLead(x, state.x, 10, 18)
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
