import type { CourseTemplate, Rect } from './course'
import { GROUND_Y } from './course'
import type { ObstaclePreset } from './presets'

export type CoinInput = { order: number; photoRef: string; message: string }

export type MovingPlatform = {
  id: string
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
  moving: MovingPlatform[]
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

export function compileCourse(template: CourseTemplate, preset: ObstaclePreset, coins: readonly CoinInput[]): RuntimeCourse {
  let solids = template.solids.map((solid) => ({ ...solid }))
  const hazards: Rect[] = []
  const moving: MovingPlatform[] = []
  for (const slot of template.slots) {
    const fill = preset.fills[slot.id] ?? { type: 'none' as const }
    if (fill.type === 'gap') {
      solids = carve(solids, slot.x, fill.w)
    } else if (fill.type === 'thorns') {
      hazards.push({ id: slot.id, x: slot.x, y: GROUND_Y - 10, w: fill.w, h: 10 })
    } else if (fill.type === 'moving-platform') {
      moving.push({
        id: slot.id,
        originX: slot.x,
        y: GROUND_Y - 52,
        w: fill.w,
        h: 8,
        travel: fill.travel,
        period: fill.period,
      })
    }
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
    moving,
    coins: placed,
    checkpoints: template.checkpoints,
    goal: template.goal,
    spawn: template.spawn,
  }
}

export function movingPlatformX(platform: MovingPlatform, time: number): number {
  return platform.originX + Math.sin((time * Math.PI * 2) / platform.period) * platform.travel
}

export function solidsAt(course: RuntimeCourse, time: number): Rect[] {
  const platforms = course.moving.map((platform) => ({
    id: platform.id,
    x: movingPlatformX(platform, time),
    y: platform.y,
    w: platform.w,
    h: platform.h,
  }))
  return [...course.solids, ...platforms]
}
