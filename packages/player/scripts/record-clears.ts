import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildCourse01, compileCourse, presetForDifficulty } from '@gfy/catalog'
import { botInput } from '../src/sim/bot'
import { PHYSICS } from '../src/sim/physics'
import { createState, snapshot, stepSim } from '../src/sim/platformer'
import { encodeTape } from '../src/sim/tape'

const coins = [
  { order: 1, photoRef: 'photo-1', message: '一' },
  { order: 2, photoRef: 'photo-2', message: '二' },
  { order: 3, photoRef: 'photo-3', message: '三' },
  { order: 4, photoRef: 'photo-4', message: '四' },
]

const out = join(dirname(fileURLToPath(import.meta.url)), '../test/tapes')
mkdirSync(out, { recursive: true })

for (const difficulty of ['easy', 'normal', 'hard'] as const) {
  const course = compileCourse(buildCourse01(), presetForDifficulty(difficulty), coins)
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
    throw new Error(`${difficulty} did not clear x=${state.x.toFixed(1)} fails=${state.fails}`)
  }
  const tape = encodeTape(inputs)
  writeFileSync(join(out, `${difficulty}.json`), JSON.stringify(tape))
  const seconds = inputs.length / 60
  console.log(`${difficulty}: ${seconds.toFixed(1)}s fails=${state.fails} coins=${state.collected.length} chunks=${tape.length}`)
}
