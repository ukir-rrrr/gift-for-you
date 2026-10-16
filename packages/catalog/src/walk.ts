export type Foot = 'left' | 'right'
export type WalkFrameCount = 6 | 8
export type PoseName = 'idle' | 'walk' | 'jump-up' | 'jump-apex' | 'jump-fall' | 'land' | 'turn'

export const SHEET_FRAME_W = 16
export const SHEET_FRAME_H = 24

export type PlantFrame = {
  frame: number
  foot: Foot
  localX: number
}

export type FootPose = {
  x: number
  y: number
}

export type HeroFrame = {
  left: FootPose
  right: FootPose
  arm: -1 | 0 | 1
  bob: 0 | 1
}

export type WalkCycle = {
  frameCount: WalkFrameCount
  frames: readonly HeroFrame[]
  plants: readonly PlantFrame[]
}

const WALK_6_FRAMES: readonly HeroFrame[] = [
  { left: { x: 5, y: 23 }, right: { x: 11, y: 21 }, arm: 1, bob: 0 },
  { left: { x: 3, y: 23 }, right: { x: 10, y: 22 }, arm: 1, bob: 1 },
  { left: { x: 6, y: 21 }, right: { x: 8, y: 22 }, arm: 0, bob: 0 },
  { left: { x: 4, y: 21 }, right: { x: 11, y: 23 }, arm: -1, bob: 0 },
  { left: { x: 6, y: 22 }, right: { x: 9, y: 23 }, arm: -1, bob: 1 },
  { left: { x: 8, y: 20 }, right: { x: 7, y: 21 }, arm: 0, bob: 0 },
]

const WALK_8_FRAMES: readonly HeroFrame[] = [
  { left: { x: 4, y: 23 }, right: { x: 12, y: 21 }, arm: 1, bob: 0 },
  { left: { x: 2, y: 23 }, right: { x: 11, y: 22 }, arm: 1, bob: 1 },
  { left: { x: 5, y: 22 }, right: { x: 9, y: 22 }, arm: 0, bob: 0 },
  { left: { x: 8, y: 20 }, right: { x: 7, y: 21 }, arm: 0, bob: 0 },
  { left: { x: 3, y: 21 }, right: { x: 12, y: 23 }, arm: -1, bob: 0 },
  { left: { x: 5, y: 22 }, right: { x: 10, y: 23 }, arm: -1, bob: 1 },
  { left: { x: 7, y: 22 }, right: { x: 8, y: 21 }, arm: 0, bob: 0 },
  { left: { x: 9, y: 20 }, right: { x: 6, y: 22 }, arm: 1, bob: 0 },
]

export const POSE_FRAMES = {
  idle: { left: { x: 5, y: 23 }, right: { x: 10, y: 23 }, arm: 0, bob: 0 },
  'jump-up': { left: { x: 6, y: 18 }, right: { x: 10, y: 18 }, arm: 1, bob: 0 },
  'jump-apex': { left: { x: 5, y: 19 }, right: { x: 11, y: 19 }, arm: 0, bob: 0 },
  'jump-fall': { left: { x: 4, y: 21 }, right: { x: 12, y: 20 }, arm: -1, bob: 0 },
  land: { left: { x: 3, y: 23 }, right: { x: 12, y: 23 }, arm: 0, bob: 1 },
  turn: { left: { x: 7, y: 23 }, right: { x: 11, y: 22 }, arm: -1, bob: 0 },
} as const satisfies Record<Exclude<PoseName, 'walk'>, HeroFrame>

function plantsFrom(frames: readonly HeroFrame[]): PlantFrame[] {
  const plants: PlantFrame[] = []
  frames.forEach((frame, index) => {
    if (frame.left.y === SHEET_FRAME_H - 1) plants.push({ frame: index, foot: 'left', localX: frame.left.x })
    if (frame.right.y === SHEET_FRAME_H - 1) plants.push({ frame: index, foot: 'right', localX: frame.right.x })
  })
  return plants
}

function cycleOf(count: WalkFrameCount, frames: readonly HeroFrame[]): WalkCycle {
  return { frameCount: count, frames, plants: plantsFrom(frames) }
}

export const WALK_6 = cycleOf(6, WALK_6_FRAMES)
export const WALK_8 = cycleOf(8, WALK_8_FRAMES)

export function walkCycle(frameCount: WalkFrameCount): WalkCycle {
  return frameCount === 6 ? WALK_6 : WALK_8
}

function firstPlant(cycle: WalkCycle, foot: Foot): PlantFrame {
  const found = cycle.plants.find((plant) => plant.foot === foot)
  if (!found) throw new Error(`missing ${foot} plant`)
  return found
}

export function stridePx(cycle: WalkCycle): number {
  const left = firstPlant(cycle, 'left')
  const right = firstPlant(cycle, 'right')
  return Math.abs(right.localX - left.localX) * 2
}

export function cycleDurationSeconds(stride: number, speedPxPerSec: number): number {
  if (speedPxPerSec === 0) return Number.POSITIVE_INFINITY
  return stride / speedPxPerSec
}

export function frameDurationSeconds(stride: number, speedPxPerSec: number, frameCount: number): number {
  return cycleDurationSeconds(stride, speedPxPerSec) / frameCount
}

export function plantedSlide(cycle: WalkCycle, foot: Foot): number {
  const perFrame = stridePx(cycle) / cycle.frameCount
  const frames = cycle.plants.filter((plant) => plant.foot === foot).sort((a, b) => a.frame - b.frame)
  let worst = 0
  for (let i = 1; i < frames.length; i++) {
    const previous = frames[i - 1]
    const current = frames[i]
    const bodyMove = perFrame * (current.frame - previous.frame)
    const footMove = current.localX - previous.localX
    worst = Math.max(worst, Math.abs(bodyMove + footMove))
  }
  return worst
}

export function remapWalkFrame(frame: number, from: WalkFrameCount, to: WalkFrameCount): number {
  if (from === to) return ((frame % to) + to) % to
  return Math.min(to - 1, Math.max(0, Math.floor((frame / from) * to)))
}

export function toggleFrameCount(count: WalkFrameCount): WalkFrameCount {
  return count === 6 ? 8 : 6
}

export function heroFrameFor(pose: PoseName, walkFrame: number, count: WalkFrameCount): HeroFrame {
  if (pose === 'walk') return walkCycle(count).frames[walkFrame % count]
  return POSE_FRAMES[pose]
}

export const ANIM_INDEX = {
  idle: [0, 1],
  walk6: [2, 3, 4, 5, 6, 7],
  walk8: [8, 9, 10, 11, 12, 13, 14, 15],
  'jump-up': [16],
  'jump-apex': [17],
  'jump-fall': [18],
  land: [19],
  turn: [20],
} as const

export const SHEET_FRAMES = 21
