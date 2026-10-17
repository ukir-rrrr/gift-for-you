import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { COURSE_DEFS, buildCourse, compileCourse, presetForDifficulty } from '@gfy/catalog'
import { botInput } from '../src/sim/bot'
import { PHYSICS } from '../src/sim/physics'
import { createState, snapshot, stepSim } from '../src/sim/platformer'
import { encodeTape } from '../src/sim/tape'

const out = join(dirname(fileURLToPath(import.meta.url)), '../test/tapes')
mkdirSync(out, { recursive: true })

/** course-01 keeps its Phase 1 file names (easy.json, ...); later courses are prefixed with their id. */
export function tapeName(courseId: string, difficulty: string): string {
  return courseId === 'course-01' ? `${difficulty}.json` : `${courseId}-${difficulty}.json`
}

for (const def of COURSE_DEFS) {
  const coins = def.coins.map((coin) => ({ order: coin.order, photoRef: `photo-${coin.order}`, message: String(coin.order) }))
  for (const difficulty of ['easy', 'normal', 'hard'] as const) {
    const course = compileCourse(buildCourse(def), presetForDifficulty(difficulty), coins)
    const state = createState(course)
    const hold = { frames: 0 }
    const inputs = []
    const limit = 60 * 170
    for (let i = 0; i < limit; i++) {
      const input = botInput(snapshot(state, course), course, hold)
      inputs.push(input)
      const fails = state.fails
      stepSim(state, input, course, PHYSICS.step)
      if (state.fails > fails) hold.frames = 0
      if (state.atGoal) break
    }
    if (!state.atGoal) {
      throw new Error(`${def.id} ${difficulty} did not clear x=${state.x.toFixed(1)} fails=${state.fails}`)
    }
    const tape = encodeTape(inputs)
    writeFileSync(join(out, tapeName(def.id, difficulty)), JSON.stringify(tape))
    const seconds = inputs.length / 60
    console.log(
      `${def.id} ${difficulty}: ${seconds.toFixed(1)}s fails=${state.fails} coins=${state.collected.length}/${coins.length} chunks=${tape.length}`,
    )
  }
}
