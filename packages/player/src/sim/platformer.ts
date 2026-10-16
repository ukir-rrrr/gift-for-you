import {
  frameDurationSeconds,
  moversOf,
  oscillatorX,
  solidsAt,
  stridePx,
  walkCycle,
  type RuntimeCourse,
  type WalkFrameCount,
} from '@gfy/catalog'
import { PHYSICS } from './physics'

export type Phase =
  | 'idle'
  | 'walk'
  | 'skid'
  | 'jump-up'
  | 'jump-apex'
  | 'jump-fall'
  | 'land'

export type AssistMode = 'none' | 'offered' | 'invincible' | 'float'

export type InputState = {
  left: boolean
  right: boolean
  jump: boolean
  jumpPressed: boolean
}

export type SimState = {
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  facing: 1 | -1
  grounded: boolean
  wasGrounded: boolean
  coyote: number
  jumpBuffer: number
  jumpHold: number
  jumping: boolean
  phase: Phase
  landTime: number
  walkFrame: number
  walkAcc: number
  time: number
  fails: number
  assist: AssistMode
  collected: string[]
  stomped: string[]
  popup: string[]
  atGoal: boolean
  groundId: string | null
  easy: boolean
  walkFrames: WalkFrameCount
  assistAfter: number
}

type Rect = { id: string; x: number; y: number; w: number; h: number }

export function createState(
  course: RuntimeCourse,
  options?: { easy?: boolean; walkFrames?: WalkFrameCount; assistAfter?: number },
): SimState {
  return {
    x: course.spawn.x,
    y: course.spawn.y,
    prevX: course.spawn.x,
    prevY: course.spawn.y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    wasGrounded: true,
    coyote: 0,
    jumpBuffer: 0,
    jumpHold: 0,
    jumping: false,
    phase: 'idle',
    landTime: 0,
    walkFrame: 0,
    walkAcc: 0,
    time: 0,
    fails: 0,
    assist: 'none',
    collected: [],
    stomped: [],
    popup: [],
    atGoal: false,
    groundId: null,
    easy: options?.easy ?? false,
    walkFrames: options?.walkFrames ?? 6,
    assistAfter: options?.assistAfter ?? 3,
  }
}

function place(state: SimState, x: number, y: number) {
  state.x = x
  state.y = y
  state.prevX = x
  state.prevY = y
  state.vx = 0
  state.vy = 0
  state.grounded = true
  state.wasGrounded = true
  state.groundId = null
  state.jumping = false
  state.jumpHold = 0
  state.coyote = 0
  state.walkAcc = 0
}

function checkpointFor(state: SimState, course: RuntimeCourse) {
  let best = course.checkpoints[0]
  for (const checkpoint of course.checkpoints) {
    if (checkpoint.x <= state.x + 8 && checkpoint.x >= best.x) best = checkpoint
  }
  return best
}

function fail(state: SimState, course: RuntimeCourse) {
  state.fails += 1
  state.stomped = []
  if (state.fails >= state.assistAfter && state.assist === 'none') state.assist = 'offered'
  const checkpoint = checkpointFor(state, course)
  place(state, checkpoint.x, checkpoint.y)
}

function stopForFail(state: SimState, course: RuntimeCourse, dt: number) {
  fail(state, course)
  updatePhase(state, dt, false, false)
}

export function sectionAt(course: RuntimeCourse, x: number) {
  let best = course.sections[0]
  for (const section of course.sections) {
    if (section.x0 <= x) best = section
  }
  return best
}

export type AssistChoice = 'invincible' | 'float' | 'easy' | 'skip' | 'decline'

export function chooseAssist(state: SimState, course: RuntimeCourse, choice: AssistChoice) {
  if (choice === 'easy' || choice === 'decline') {
    if (choice === 'easy') state.easy = true
    state.assist = 'none'
    state.fails = 0
    return
  }
  if (choice === 'skip') {
    const section = sectionAt(course, state.x)
    for (const coin of course.coins) {
      if (coin.sectionId !== section.id || state.collected.includes(coin.id)) continue
      state.collected.push(coin.id)
      state.popup.push(coin.id)
    }
    const index = course.sections.findIndex((entry) => entry.id === section.id)
    const next = course.sections[index + 1]
    if (!next) {
      place(state, course.goal.x, course.goal.y)
      state.atGoal = true
      state.phase = 'idle'
    } else {
      const checkpoint = course.checkpoints.find((entry) => entry.sectionId === next.id) ?? course.checkpoints[0]
      place(state, checkpoint.x, checkpoint.y)
    }
    state.assist = 'none'
    state.fails = 0
    return
  }
  state.assist = choice
}

export function dismissPopup(state: SimState) {
  state.popup.shift()
}

function bounds(state: SimState) {
  return {
    l: state.x - PHYSICS.width / 2,
    r: state.x + PHYSICS.width / 2,
    t: state.y - PHYSICS.height,
    b: state.y,
  }
}

function hits(box: { l: number; r: number; t: number; b: number }, solid: Rect) {
  return box.r > solid.x && box.l < solid.x + solid.w && box.b > solid.y && box.t < solid.y + solid.h
}

function resolveX(state: SimState, solids: readonly Rect[]) {
  let box = bounds(state)
  for (const solid of solids) {
    if (!hits(box, solid)) continue
    const rise = state.y - solid.y
    if (rise > 0 && rise <= PHYSICS.stepUp && state.vy >= 0) {
      state.y = solid.y
      state.vy = 0
      state.grounded = true
      state.groundId = solid.id
      box = bounds(state)
      continue
    }
    if (state.vx > 0) state.x = solid.x - PHYSICS.width / 2
    else if (state.vx < 0) state.x = solid.x + solid.w + PHYSICS.width / 2
    else state.x = state.prevX
    state.vx = 0
    box = bounds(state)
  }
}

function resolveY(state: SimState, solids: readonly Rect[]): boolean {
  let landed = false
  state.grounded = false
  let box = bounds(state)
  for (const solid of solids) {
    if (!hits(box, solid)) continue
    if (state.vy >= 0 && state.prevY <= solid.y + 1) {
      if (state.prevY < solid.y - 1) landed = true
      state.y = solid.y
      state.vy = 0
      state.grounded = true
      state.groundId = solid.id
      box = bounds(state)
    } else if (state.vy < 0) {
      state.y = solid.y + solid.h + PHYSICS.height
      state.vy = 0
      state.jumping = false
      box = bounds(state)
    }
  }
  if (!state.grounded && state.vy >= 0) {
    for (const solid of solids) {
      const feet = bounds(state)
      const xOverlap = feet.r > solid.x + 1 && feet.l < solid.x + solid.w - 1
      if (!xOverlap) continue
      const dist = solid.y - state.y
      if (dist >= -0.25 && dist <= 1.25) {
        state.y = solid.y
        state.vy = 0
        state.grounded = true
        state.groundId = solid.id
      }
    }
  }
  return landed
}

function advanceWalk(state: SimState, dt: number) {
  const speed = Math.abs(state.vx)
  const stride = stridePx(walkCycle(state.walkFrames))
  const frameDt = frameDurationSeconds(stride, speed, state.walkFrames)
  if (!Number.isFinite(frameDt) || speed === 0) {
    state.walkFrame = 0
    state.walkAcc = 0
    return
  }
  state.walkAcc += dt
  let guard = 0
  while (state.walkAcc >= frameDt && guard < 8) {
    state.walkAcc -= frameDt
    state.walkFrame = (state.walkFrame + 1) % state.walkFrames
    guard += 1
  }
}

function updatePhase(state: SimState, dt: number, skidding: boolean, landed: boolean) {
  if (state.atGoal) {
    state.phase = 'idle'
    state.vx = 0
    state.vy = 0
    return
  }
  if (!state.grounded) {
    if (state.vy < -PHYSICS.apex) state.phase = 'jump-up'
    else if (state.vy > PHYSICS.apex) state.phase = 'jump-fall'
    else state.phase = 'jump-apex'
    state.walkAcc = 0
    return
  }
  if (landed) state.landTime = PHYSICS.landDuration
  if (state.landTime > 0) {
    state.phase = 'land'
    state.landTime = Math.max(0, state.landTime - dt)
    state.walkAcc = 0
    return
  }
  if (skidding) {
    state.phase = 'skid'
    state.walkAcc = 0
    return
  }
  if (Math.abs(state.vx) < 4) {
    state.phase = 'idle'
    state.walkFrame = 0
    state.walkAcc = 0
    return
  }
  state.phase = 'walk'
  advanceWalk(state, dt)
}

export function stepSim(state: SimState, input: InputState, course: RuntimeCourse, dt: number) {
  state.prevX = state.x
  state.prevY = state.y
  state.time += dt

  if (state.atGoal) {
    state.vx = 0
    state.vy = 0
    state.phase = 'idle'
    return
  }

  const solidsNow = solidsAt(course, state.time)
  if (state.groundId) {
    const before = solidsAt(course, state.time - dt).find((solid) => solid.id === state.groundId)
    const after = solidsNow.find((solid) => solid.id === state.groundId)
    if (before && after) state.x += after.x - before.x
  }

  let dir = 0
  if (input.left) dir -= 1
  if (input.right) dir += 1
  if (state.easy) dir = 1
  const accel = state.grounded ? PHYSICS.accel : PHYSICS.airAccel
  if (dir !== 0) {
    state.vx += dir * accel * dt
    if (state.vx > PHYSICS.maxSpeed) state.vx = PHYSICS.maxSpeed
    if (state.vx < -PHYSICS.maxSpeed) state.vx = -PHYSICS.maxSpeed
    state.facing = dir > 0 ? 1 : -1
  } else if (state.vx !== 0) {
    const sign = Math.sign(state.vx)
    const next = state.vx - sign * PHYSICS.decel * dt
    state.vx = sign > 0 ? Math.max(0, next) : Math.min(0, next)
  }
  const skidding =
    state.grounded && dir !== 0 && state.vx !== 0 && Math.sign(state.vx) === -dir && Math.abs(state.vx) > PHYSICS.skidSpeed

  state.x += state.vx * dt
  if (state.x < PHYSICS.width / 2) {
    state.x = PHYSICS.width / 2
    state.vx = 0
  }
  resolveX(state, solidsNow)

  if (input.jumpPressed) state.jumpBuffer = PHYSICS.jumpBuffer
  const canJump = state.grounded || state.coyote > 0
  if (state.jumpBuffer > 0 && canJump) {
    state.vy = PHYSICS.jumpVelocity
    state.grounded = false
    state.groundId = null
    state.coyote = 0
    state.jumpBuffer = 0
    state.jumpHold = PHYSICS.maxJumpHold
    state.jumping = true
  }
  if (state.jumping && input.jump && state.jumpHold > 0 && state.vy < 0) {
    state.vy += PHYSICS.holdAccel * dt
    state.jumpHold -= dt
  } else {
    state.jumpHold = 0
  }
  if (state.jumping && !input.jump && state.vy < PHYSICS.jumpCut) state.vy = PHYSICS.jumpCut

  const gravity = state.assist === 'float' ? PHYSICS.floatGravity : PHYSICS.gravity
  state.vy += gravity * dt
  if (state.assist === 'float' && state.vy > 80) state.vy = 80
  state.y += state.vy * dt
  const landed = resolveY(state, solidsNow)

  if (state.wasGrounded && !state.grounded && state.vy >= 0) state.coyote = PHYSICS.coyote
  else if (!state.grounded) state.coyote = Math.max(0, state.coyote - dt)
  else state.coyote = 0
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt)
  state.wasGrounded = state.grounded
  if (state.grounded) state.jumping = false

  const box = bounds(state)
  for (const coin of course.coins) {
    if (state.collected.includes(coin.id)) continue
    if (hits(box, coin)) {
      state.collected.push(coin.id)
      state.popup.push(coin.id)
    }
  }

  for (const walker of moversOf(course, 'stompable')) {
    if (state.stomped.includes(walker.id)) continue
    const x = oscillatorX(walker, state.time)
    const foe = { id: walker.id, x, y: walker.y, w: walker.w, h: walker.h }
    if (!hits(box, foe)) continue
    const fromAbove = state.vy > PHYSICS.stompVy && state.prevY <= walker.y + PHYSICS.stompSlack
    if (fromAbove) {
      state.stomped.push(walker.id)
      state.vy = PHYSICS.stompBounce
      state.jumping = false
      continue
    }
    if (state.assist !== 'invincible') {
      stopForFail(state, course, dt)
      return
    }
  }
  if (state.assist !== 'invincible' && course.hazards.some((hazard) => hits(box, hazard))) {
    stopForFail(state, course, dt)
    return
  }
  if (state.y > PHYSICS.killY) {
    if (state.assist === 'invincible') {
      const checkpoint = checkpointFor(state, course)
      place(state, checkpoint.x, checkpoint.y)
      updatePhase(state, dt, false, false)
      return
    }
    stopForFail(state, course, dt)
    return
  }

  if (state.grounded && state.x >= course.goal.x && Math.abs(state.y - course.goal.y) <= PHYSICS.goalSlack) {
    state.atGoal = true
    state.vx = 0
    state.vy = 0
    state.phase = 'idle'
    return
  }

  updatePhase(state, dt, skidding, landed)
}

export type Snapshot = {
  x: number
  y: number
  prevX: number
  prevY: number
  vx: number
  vy: number
  facing: 1 | -1
  phase: Phase
  walkFrame: number
  walkFrames: WalkFrameCount
  grounded: boolean
  time: number
  fails: number
  assist: AssistMode
  collected: readonly string[]
  stomped: readonly string[]
  popup: readonly string[]
  atGoal: boolean
  sectionName: string
  easy: boolean
}

export function snapshot(state: SimState, course: RuntimeCourse): Snapshot {
  return {
    x: state.x,
    y: state.y,
    prevX: state.prevX,
    prevY: state.prevY,
    vx: state.vx,
    vy: state.vy,
    facing: state.facing,
    phase: state.phase,
    walkFrame: state.walkFrame,
    walkFrames: state.walkFrames,
    grounded: state.grounded,
    time: state.time,
    fails: state.fails,
    assist: state.assist,
    collected: state.collected,
    stomped: state.stomped,
    popup: state.popup,
    atGoal: state.atGoal,
    sectionName: sectionAt(course, state.x).name,
    easy: state.easy,
  }
}

export function interpolatedFeet(
  state: { prevX: number; prevY: number; x: number; y: number },
  alpha: number,
) {
  const t = Math.min(1, Math.max(0, alpha))
  return {
    x: state.prevX + (state.x - state.prevX) * t,
    y: state.prevY + (state.y - state.prevY) * t,
  }
}
