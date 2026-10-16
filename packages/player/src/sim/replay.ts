import type { RuntimeCourse } from '@gfy/catalog'
import { PHYSICS } from './physics'
import { stepSim, type InputState, type SimState } from './platformer'

export function runReplay(
  state: SimState,
  course: RuntimeCourse,
  inputAt: (state: SimState) => InputState,
  maxSec: number,
): SimState {
  const steps = Math.floor(maxSec / PHYSICS.step)
  for (let i = 0; i < steps; i++) {
    if (state.goalBeat !== 'none') break
    stepSim(state, inputAt(state), course, PHYSICS.step)
  }
  return state
}
