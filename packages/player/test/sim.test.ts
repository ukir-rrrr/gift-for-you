import { buildCourse01, buildCourseE2E, compileCourse, presetForDifficulty, stridePx, walkCycle } from '@gfy/catalog'
import { describe, expect, it } from 'vitest'
import { glowAlpha, glowFrequency, glowPulseCount } from '../src/fx'
import { PlatformerMode } from '../src/mode'
import { botInput } from '../src/sim/bot'
import { PHYSICS } from '../src/sim/physics'
import { createState, stepSim, type InputState, type SimState } from '../src/sim/platformer'
import { runReplay } from '../src/sim/replay'
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
    moving: [],
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
    const state = runReplay(createState(course), course, () => right, 5)
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

  it('clears the compact course in easy mode and the template with a bot', () => {
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

    const course = compileCourse(buildCourse01(), presetForDifficulty('normal'), coins)
    const mode = new PlatformerMode()
    mode.load(course)
    const hold = { frames: 0 }
    let steps = 0
    while (!mode.onGoal() && steps < 60 * 180) {
      const snap = mode.read()
      if (!snap) break
      mode.setInput(
        botInput(
          {
            x: snap.x,
            y: snap.y,
            grounded: snap.grounded,
            time: snap.time,
            atGoal: snap.atGoal,
            assist: snap.assist,
          },
          course,
          hold,
        ),
      )
      mode.update(PHYSICS.step)
      steps += 1
    }
    expect(mode.onGoal()?.templateId).toBe('course-01')
    const seconds = steps / 60
    expect(seconds).toBeGreaterThan(90)
    expect(seconds).toBeLessThan(150)
    expect(mode.read()?.collected).toHaveLength(4)
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
