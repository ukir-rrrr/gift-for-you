import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COURSE_DEFS, buildCourse, buildCourse01, buildCourseE2E, compileCourse, presetForDifficulty, stridePx, walkCycle, WALKER_H, WALKER_W } from '@gfy/catalog'
import { describe, expect, it } from 'vitest'
import { glowAlpha, glowFrequency, glowPulseCount } from '../src/fx'
import { PlatformerMode } from '../src/mode'
import { PHYSICS } from '../src/sim/physics'
import { createState, stepSim, type InputState, type SimState } from '../src/sim/platformer'
import { runTape, type TapeChunk } from '../src/sim/tape'
import type { RuntimeCourse } from '@gfy/catalog'

const idle: InputState = { left: false, right: false, jump: false, jumpPressed: false }
const right: InputState = { ...idle, right: true }

function flat(width = 2400): RuntimeCourse {
  return {
    templateId: 'flat',
    width,
    height: 320,
    sections: [{ id: 'meet', name: '出会いの道', x0: 0, x1: width }],
    solids: [{ id: 'ground', x: 0, y: 272, w: width, h: 48 }],
    hazards: [],
    movers: [],
    coins: [{ id: 'coin-1', x: 180, y: 240, w: 14, h: 16, sectionId: 'meet', order: 1, photoRef: 'photo-1', message: '一枚' }],
    checkpoints: [{ id: 'cp', x: 40, y: 272, sectionId: 'meet' }],
    goal: { x: width - 80, y: 272 },
    spawn: { x: 40, y: 272 },
  }
}

function run(state: SimState, course: RuntimeCourse, input: InputState, steps: number) {
  for (let i = 0; i < steps; i++) stepSim(state, input, course, PHYSICS.step)
}

describe('physics', () => {
  it('accelerates to max speed instead of snapping', () => {
    expect(PHYSICS.coyote).toBeGreaterThanOrEqual(0.08)
    expect(PHYSICS.coyote).toBeLessThanOrEqual(0.1)
    expect(PHYSICS.jumpBuffer).toBeGreaterThanOrEqual(0.08)
    expect(PHYSICS.jumpBuffer).toBeLessThanOrEqual(0.1)
    const state = createState(flat())
    stepSim(state, right, flat(), PHYSICS.step)
    expect(state.vx).toBeGreaterThan(0)
    expect(state.vx).toBeLessThan(PHYSICS.maxSpeed)
    run(state, flat(), right, 40)
    expect(state.vx).toBeCloseTo(PHYSICS.maxSpeed, 5)
  })

  it('keeps a coyote jump and ignores a late one', () => {
    const course: RuntimeCourse = {
      ...flat(400),
      solids: [{ id: 'ledge', x: 0, y: 272, w: 80, h: 48 }],
      spawn: { x: 70, y: 272 },
      goal: { x: 900, y: 272 },
    }
    const early = createState(course)
    let left = false
    let jumped = false
    for (let i = 0; i < 40 && !jumped; i++) {
      const airborne = !early.grounded
      stepSim(early, right, course, PHYSICS.step)
      if (!left && airborne) left = true
      if (left && i > 0 && early.time > 0 && !early.grounded) {
        const waited = early.coyote < PHYSICS.coyote
        if (waited && early.coyote > 0) {
          stepSim(early, { ...right, jump: true, jumpPressed: true }, course, PHYSICS.step)
          jumped = true
        }
      }
    }
    expect(early.vy).toBeLessThan(0)

    const late = createState(course)
    let seen = false
    for (let i = 0; i < 80; i++) {
      stepSim(late, right, course, PHYSICS.step)
      if (!late.grounded) seen = true
      if (seen && late.coyote === 0 && late.y > 272) break
    }
    const y = late.y
    stepSim(late, { ...idle, jump: true, jumpPressed: true }, course, PHYSICS.step)
    expect(late.vy).toBeGreaterThan(0)
    expect(late.y).toBeGreaterThan(y)
  })

  it('buffers a jump just before landing and varies height with hold', () => {
    const course = flat()
    const buffered = createState(course)
    buffered.y = 269
    buffered.grounded = false
    buffered.wasGrounded = false
    buffered.vy = 200
    stepSim(buffered, { ...idle, jump: true, jumpPressed: true }, course, PHYSICS.step)
    let hopped = false
    for (let i = 0; i < 40; i++) {
      stepSim(buffered, idle, course, PHYSICS.step)
      if (buffered.vy < 0) hopped = true
    }
    expect(hopped).toBe(true)

    const short = createState(course)
    stepSim(short, { ...idle, jumpPressed: true, jump: false }, course, PHYSICS.step)
    let shortMin = short.y
    for (let i = 0; i < 80; i++) {
      stepSim(short, idle, course, PHYSICS.step)
      shortMin = Math.min(shortMin, short.y)
    }
    const held = createState(course)
    stepSim(held, { ...idle, jumpPressed: true, jump: true }, course, PHYSICS.step)
    let heldMin = held.y
    for (let i = 0; i < 8; i++) {
      stepSim(held, { ...idle, jump: true }, course, PHYSICS.step)
      heldMin = Math.min(heldMin, held.y)
    }
    for (let i = 0; i < 80; i++) {
      stepSim(held, idle, course, PHYSICS.step)
      heldMin = Math.min(heldMin, held.y)
    }
    expect(heldMin).toBeLessThan(shortMin - 8)
  })
})

describe('walk playback', () => {
  it('moves one stride per cycle at constant speed for both frame counts', () => {
    for (const frames of [6, 8] as const) {
      const course = flat()
      const state = createState(course, { walkFrames: frames })
      run(state, course, right, 90)
      expect(state.phase).toBe('walk')
      const stride = stridePx(walkCycle(frames))
      const steps = Math.round(stride / PHYSICS.maxSpeed / PHYSICS.step)
      const x0 = state.x
      const frame0 = state.walkFrame
      run(state, course, right, steps)
      expect(state.x - x0).toBeCloseTo(stride, 0)
      expect(state.walkFrame).toBe(frame0)
    }
  })

  it('idles at zero speed', () => {
    const course = flat()
    const state = createState(course)
    run(state, course, idle, 30)
    expect(state.phase).toBe('idle')
    expect(state.walkFrame).toBe(0)
    expect(state.x).toBe(course.spawn.x)
  })

  it('replays a right-walk timeline onto a coin', () => {
    const course = flat()
    const state = createState(course)
    run(state, course, right, 5 * 60)
    expect(state.collected).toContain('coin-1')
  })
})

describe('course rules', () => {
  it('respawns at the checkpoint and offers help after three fails', () => {
    const course: RuntimeCourse = {
      ...flat(300),
      solids: [{ id: 'pad', x: 0, y: 272, w: 48, h: 48 }],
      spawn: { x: 24, y: 272 },
      goal: { x: 500, y: 272 },
    }
    const mode = new PlatformerMode()
    mode.load(course)
    for (let fail = 0; fail < 3; fail++) {
      mode.setInput(right)
      for (let i = 0; i < 180; i++) mode.update(PHYSICS.step)
    }
    const snap = mode.read()
    expect(snap?.fails).toBeGreaterThanOrEqual(3)
    expect(snap?.assist).toBe('offered')
    expect(snap && snap.x).toBeLessThan(160)
  })

  it('waits at the checkpoint while help is offered, then takes easy or declines', () => {
    const course: RuntimeCourse = {
      ...flat(300),
      solids: [{ id: 'pad', x: 0, y: 272, w: 48, h: 48 }],
      spawn: { x: 24, y: 272 },
      goal: { x: 500, y: 272 },
    }
    for (const choice of ['easy', 'decline'] as const) {
      const mode = new PlatformerMode()
      mode.load(course, { assistAfter: 1 })
      mode.setInput(right)
      for (let i = 0; i < 180 && mode.assist() !== 'offered'; i++) mode.update(PHYSICS.step)
      expect(mode.assist()).toBe('offered')
      const held = mode.read()!
      for (let i = 0; i < 60; i++) mode.update(PHYSICS.step)
      expect(mode.read()!.time).toBe(held.time)
      expect(mode.read()!.x).toBe(held.x)
      mode.chooseAssist(choice)
      const snap = mode.read()!
      expect(snap.assist).toBe('none')
      expect(snap.fails).toBe(0)
      expect(snap.easy).toBe(choice === 'easy')
      mode.update(PHYSICS.step * 2)
      expect(mode.read()!.time).toBeGreaterThan(held.time)
    }
  })

  it('skip-section collects that section memory coins', () => {
    const coins = [
      { order: 1, photoRef: 'photo-1', message: '一' },
      { order: 2, photoRef: 'photo-2', message: '二' },
      { order: 3, photoRef: 'photo-3', message: '三' },
      { order: 4, photoRef: 'missing-photo', message: '四' },
    ]
    const course = compileCourse(buildCourse01(), presetForDifficulty('easy'), coins)
    const mode = new PlatformerMode()
    mode.load(course)
    mode.chooseAssist('skip')
    const snap = mode.read()
    expect(snap?.collected).toEqual(['coin-1', 'coin-2'])
    expect(snap?.popup).toEqual(['coin-1', 'coin-2'])
    expect(snap?.sectionName).toBe('思い出の小道')
  })

  it('clears the compact course in easy mode', () => {
    const coins = [
      { order: 1, photoRef: 'photo-1', message: '一枚目' },
      { order: 2, photoRef: 'photo-2', message: '二枚目' },
      { order: 3, photoRef: 'photo-3', message: '三枚目' },
      { order: 4, photoRef: 'missing-photo', message: 'ない' },
    ]
    const compact = new PlatformerMode()
    compact.load(compileCourse(buildCourseE2E(), presetForDifficulty('easy'), coins), { easy: true })
    for (let i = 0; i < 60 * 20 && !compact.onGoal(); i++) compact.update(PHYSICS.step)
    expect(compact.onGoal()?.templateId).toBe('course-e2e')
    expect(compact.read()?.collected).toContain('coin-1')
  })

  it('stomps a walker from above and returns to the checkpoint on a side bump', () => {
    const course: RuntimeCourse = {
      ...flat(400),
      movers: [{ id: 'w1', role: 'stompable', originX: 140, y: 272 - WALKER_H, w: WALKER_W, h: WALKER_H, travel: 0, period: 8 }],
      spawn: { x: 40, y: 272 },
      goal: { x: 380, y: 272 },
    }
    const stomp = createState(course)
    stomp.x = 146
    stomp.prevX = 146
    stomp.y = 272 - WALKER_H + 2
    stomp.prevY = stomp.y - 6
    stomp.vy = 90
    stomp.grounded = false
    stomp.wasGrounded = false
    stepSim(stomp, idle, course, PHYSICS.step)
    expect(stomp.stomped).toContain('w1')
    expect(stomp.vy).toBeLessThan(0)
    expect(stomp.fails).toBe(0)

    const bump = createState(course)
    bump.x = 130
    bump.prevX = 128
    run(bump, course, right, 40)
    expect(bump.fails).toBeGreaterThanOrEqual(1)
    expect(bump.x).toBeLessThan(80)
  })

  it('sends thorn hits back to the last checkpoint', () => {
    const course: RuntimeCourse = {
      ...flat(400),
      hazards: [{ id: 'bramble', x: 120, y: 262, w: 16, h: 10 }],
      checkpoints: [{ id: 'cp', x: 40, y: 272, sectionId: 'meet' }],
      spawn: { x: 40, y: 272 },
      goal: { x: 380, y: 272 },
    }
    const state = createState(course)
    run(state, course, right, 90)
    expect(state.fails).toBeGreaterThanOrEqual(1)
    expect(state.x).toBeLessThan(80)
    expect(state.y).toBeCloseTo(272, 0)
  })
})

describe('recorded clears', () => {
  const coins = [
    { order: 1, photoRef: 'photo-1', message: '一' },
    { order: 2, photoRef: 'photo-2', message: '二' },
    { order: 3, photoRef: 'photo-3', message: '三' },
    { order: 4, photoRef: 'photo-4', message: '四' },
  ]

  it.each(['easy', 'normal', 'hard'] as const)('replays the frozen %s tape onto the gift', (difficulty) => {
    const tape = JSON.parse(
      readFileSync(join(import.meta.dirname, `tapes/${difficulty}.json`), 'utf8'),
    ) as TapeChunk[]
    const course = compileCourse(buildCourse01(), presetForDifficulty(difficulty), coins)
    const state = createState(course)
    const steps = runTape((input) => {
      stepSim(state, input, course, PHYSICS.step)
      return state.atGoal
    }, tape, 60 * 170)
    expect(state.atGoal).toBe(true)
    expect(state.fails).toBe(0)
    expect(state.collected).toHaveLength(4)
    const seconds = (steps + 1) / 60
    expect(seconds).toBeGreaterThan(90)
    expect(seconds).toBeLessThan(150)
  })
})

describe('recorded clears on every template (F3-01)', () => {
  const cases = COURSE_DEFS.flatMap((def) => (['easy', 'normal', 'hard'] as const).map((difficulty) => [def.id, difficulty] as const))

  it.each(cases)('replays the frozen %s %s tape onto the gift', (courseId, difficulty) => {
    const def = COURSE_DEFS.find((entry) => entry.id === courseId)!
    const name = courseId === 'course-01' ? `${difficulty}.json` : `${courseId}-${difficulty}.json`
    const tape = JSON.parse(readFileSync(join(import.meta.dirname, `tapes/${name}`), 'utf8')) as TapeChunk[]
    const coins = def.coins.map((coin) => ({ order: coin.order, photoRef: `photo-${coin.order}`, message: String(coin.order) }))
    const course = compileCourse(buildCourse(def), presetForDifficulty(difficulty), coins)
    const state = createState(course)
    const steps = runTape((input) => {
      stepSim(state, input, course, PHYSICS.step)
      return state.atGoal
    }, tape, 60 * 170)
    expect(state.atGoal).toBe(true)
    expect(state.fails).toBe(0)
    expect(state.collected).toHaveLength(coins.length)
    // About two minutes each.
    const seconds = (steps + 1) / 60
    expect(seconds).toBeGreaterThan(100)
    expect(seconds).toBeLessThan(130)
    // Three sections, each with its own checkpoint.
    expect(course.sections).toHaveLength(3)
    expect(new Set(course.checkpoints.map((cp) => cp.sectionId)).size).toBe(3)
  })
})

describe('glow', () => {
  it('pulses slower than 3 Hz and holds steady when flash is reduced', () => {
    expect(glowPulseCount(1)).toBeLessThan(3)
    expect(glowFrequency(false)).toBeLessThan(3)
    expect(glowFrequency(true)).toBe(0)
    expect(glowAlpha(0, true)).toBe(1)
    expect(glowAlpha(0.5, true)).toBe(1)
    expect(glowAlpha(0, false)).not.toBe(glowAlpha(1 / 0.4 / 4, false))
  })
})
