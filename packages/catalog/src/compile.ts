import type { CourseTemplate, Rect } from './course'
import { COURSE_HEIGHT, GROUND_Y, PLATFORM_H, STEP_RUN, STEP_W, THORN_H, WALKER_H, WALKER_W } from './course'
import type { ObstacleFill, ObstaclePreset } from './presets'

export type CoinInput = { order: number; photoRef: string; message: string }

export type MoverRole = 'solid' | 'stompable'

export type Mover = {
  id: string
  role: MoverRole
  originX: number
  y: number
  w: number
  h: number
  travel: number
  period: number
}

export type RuntimeCoin = {
  id: string
  x: number
  y: number
  w: number
  h: number
  sectionId: string
  order: number
  photoRef: string
  message: string
}

export type RuntimeCourse = {
  templateId: string
  width: number
  height: number
  sections: CourseTemplate['sections']
  solids: Rect[]
  hazards: Rect[]
  movers: Mover[]
  coins: RuntimeCoin[]
  checkpoints: CourseTemplate['checkpoints']
  goal: { x: number; y: number }
  spawn: { x: number; y: number }
}

function carve(solids: readonly Rect[], x: number, w: number): Rect[] {
  const next: Rect[] = []
  const left = x
  const right = x + w
  for (const solid of solids) {
    if (solid.y !== GROUND_Y) {
      next.push(solid)
      continue
    }
    const x1 = solid.x
    const x2 = solid.x + solid.w
    if (right <= x1 || left >= x2) {
      next.push(solid)
      continue
    }
    if (left - x1 >= 8) next.push({ ...solid, id: `${solid.id}-a`, w: left - x1 })
    if (x2 - right >= 8) next.push({ ...solid, id: `${solid.id}-b`, x: right, w: x2 - right })
  }
  return next
}

function waveX(originX: number, travel: number, period: number, time: number): number {
  return originX + Math.sin((time * Math.PI * 2) / period) * travel
}

function applyFill(
  fill: ObstacleFill,
  slot: { id: string; x: number },
  solids: Rect[],
  hazards: Rect[],
  movers: Mover[],
): Rect[] {
  switch (fill.type) {
    case 'none':
      return solids
    case 'gap':
      return carve(solids, slot.x, fill.w)
    case 'thorns':
      hazards.push({ id: slot.id, x: slot.x, y: GROUND_Y - THORN_H, w: fill.w, h: THORN_H })
      return solids
    case 'moving-platform':
      movers.push({
        id: slot.id,
        role: 'solid',
        originX: slot.x,
        y: GROUND_Y - 52,
        w: fill.w,
        h: PLATFORM_H,
        travel: fill.travel,
        period: fill.period,
      })
      return solids
    case 'steps': {
      let x = slot.x
      fill.lifts.forEach((lift, index) => {
        const y = GROUND_Y - lift
        solids.push({
          id: `${slot.id}-step-${index}`,
          x,
          y,
          w: STEP_W,
          h: COURSE_HEIGHT - y,
        })
        x += STEP_RUN
      })
      return solids
    }
    case 'walker':
      movers.push({
        id: slot.id,
        role: 'stompable',
        originX: slot.x + 10,
        y: GROUND_Y - WALKER_H,
        w: WALKER_W,
        h: WALKER_H,
        travel: fill.travel,
        period: fill.period,
      })
      return solids
    default: {
      const exhausted: never = fill
      throw new Error(`unknown fill ${(exhausted as ObstacleFill).type}`)
    }
  }
}

export function compileCourse(template: CourseTemplate, preset: ObstaclePreset, coins: readonly CoinInput[]): RuntimeCourse {
  let solids = template.solids.map((solid) => ({ ...solid }))
  const hazards: Rect[] = []
  const movers: Mover[] = []
  for (const slot of template.slots) {
    solids = applyFill(preset.fills[slot.id] ?? { type: 'none' }, slot, solids, hazards, movers)
  }
  const placed: RuntimeCoin[] = []
  for (const slot of template.coinSlots) {
    const coin = coins.find((entry) => entry.order === slot.order)
    if (!coin) continue
    placed.push({
      id: `coin-${slot.order}`,
      x: slot.x,
      y: slot.y,
      w: 14,
      h: 16,
      sectionId: slot.sectionId,
      order: slot.order,
      photoRef: coin.photoRef,
      message: coin.message,
    })
  }
  return {
    templateId: template.id,
    width: template.width,
    height: template.height,
    sections: template.sections,
    solids,
    hazards,
    movers,
    coins: placed,
    checkpoints: template.checkpoints,
    goal: template.goal,
    spawn: template.spawn,
  }
}

export function oscillatorX(mover: Mover, time: number): number {
  return waveX(mover.originX, mover.travel, mover.period, time)
}

export function oscillatorFacing(mover: Mover, time: number): 1 | -1 {
  return Math.cos((time * Math.PI * 2) / mover.period) < 0 ? -1 : 1
}

export function moversOf(course: RuntimeCourse, role: MoverRole): Mover[] {
  return course.movers.filter((mover) => mover.role === role)
}

export function solidsAt(course: RuntimeCourse, time: number): Rect[] {
  const platforms = moversOf(course, 'solid').map((platform) => ({
    id: platform.id,
    x: oscillatorX(platform, time),
    y: platform.y,
    w: platform.w,
    h: platform.h,
  }))
  return [...course.solids, ...platforms]
}
