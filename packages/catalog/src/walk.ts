export type Foot = 'left' | 'right'

export type PlantFrame = {
  frame: number
  foot: Foot
  localX: number
}

export type WalkFrameCount = 6 | 8

export type WalkCycle = {
  frameCount: WalkFrameCount
  plants: readonly PlantFrame[]
}

function cycle(frameCount: WalkFrameCount, step: number): WalkCycle {
  const delta = 2
  const samples = step / delta + 1
  const start = step / 2
  const plants: PlantFrame[] = []
  for (const foot of ['left', 'right'] as const) {
    const origin = foot === 'left' ? 0 : frameCount / 2
    for (let i = 0; i < samples; i++) {
      plants.push({
        frame: (origin + i) % frameCount,
        foot,
        localX: start - delta * i,
      })
    }
  }
  return { frameCount, plants }
}

export const WALK_6: WalkCycle = cycle(6, 6)
export const WALK_8: WalkCycle = cycle(8, 8)

export function walkCycle(frameCount: WalkFrameCount): WalkCycle {
  return frameCount === 6 ? WALK_6 : WALK_8
}

export function stanceTravel(plants: readonly PlantFrame[], foot: Foot): number {
  const mine = plants.filter((plant) => plant.foot === foot)
  let travel = 0
  for (let i = 1; i < mine.length; i++) {
    travel += Math.abs(mine[i].localX - mine[i - 1].localX)
  }
  return travel
}

/** Full cycle distance. One foot's planted travel is one step, and a cycle is two steps. */
export function fullCycleStridePx(plants: readonly PlantFrame[]): number {
  return stanceTravel(plants, 'left') * 2
}

export function cycleDurationSeconds(stridePx: number, speedPxPerSec: number): number {
  if (speedPxPerSec === 0) return Number.POSITIVE_INFINITY
  return stridePx / speedPxPerSec
}

export function frameDurationSeconds(stridePx: number, speedPxPerSec: number, frameCount: number): number {
  return cycleDurationSeconds(stridePx, speedPxPerSec) / frameCount
}

export function maxContactSlip(
  plants: readonly PlantFrame[],
  foot: Foot,
  stridePx: number,
  frameCount: number,
): number {
  const perFrame = stridePx / frameCount
  const mine = plants.filter((plant) => plant.foot === foot)
  let max = 0
  for (let i = 1; i < mine.length; i++) {
    const frameDelta = (mine[i].frame - mine[i - 1].frame + frameCount) % frameCount
    const expected = perFrame * frameDelta
    const actual = mine[i - 1].localX - mine[i].localX
    max = Math.max(max, Math.abs(actual - expected))
  }
  return max
}

export const SHEET_FRAME_W = 16
export const SHEET_FRAME_H = 24

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
