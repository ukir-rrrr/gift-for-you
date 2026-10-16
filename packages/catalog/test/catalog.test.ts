import { parseShareJson } from '@gfy/schema'
import { describe, expect, it } from 'vitest'
import {
  GROUND_Y,
  PALETTE,
  SAMPLE_SHARES,
  WALK_6,
  WALK_8,
  buildCourse01,
  catalogIndex,
  compileCourse,
  frameDurationSeconds,
  fullCycleStridePx,
  maxContactSlip,
  presetForDifficulty,
  stanceTravel,
} from '../src/index'

const coins = [
  { order: 1, photoRef: 'photo-1', message: '一枚目' },
  { order: 2, photoRef: 'photo-2', message: '二枚目' },
  { order: 3, photoRef: 'photo-3', message: '三枚目' },
  { order: 4, photoRef: 'missing-photo', message: 'ない' },
]

describe('palette and walk', () => {
  it('keeps the style palette at 28 colors', () => {
    expect(new Set(PALETTE).size).toBe(28)
  })

  it('measures a two-step stride and a zero-slip contact', () => {
    expect(stanceTravel(WALK_6.plants, 'left')).toBe(6)
    expect(stanceTravel(WALK_6.plants, 'right')).toBe(6)
    expect(fullCycleStridePx(WALK_6.plants)).toBe(12)
    expect(fullCycleStridePx(WALK_8.plants)).toBe(16)
    expect(maxContactSlip(WALK_6.plants, 'left', 12, 6)).toBe(0)
    expect(maxContactSlip(WALK_8.plants, 'right', 16, 8)).toBe(0)
    expect(frameDurationSeconds(12, 60, 6)).toBeCloseTo(12 / 60 / 6)
    expect(frameDurationSeconds(12, 0, 6)).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('course compile', () => {
  it('parses the bundled demo and wires coins onto named slots', () => {
    const parsed = parseShareJson(SAMPLE_SHARES.demo, catalogIndex())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const course = compileCourse(buildCourse01(), presetForDifficulty(parsed.value.course.difficulty), parsed.value.memoryCoins)
    expect(course.templateId).toBe('course-01')
    expect(course.sections.map((section) => section.name)).toEqual(['出会いの道', '思い出の小道', 'ゴールの丘'])
    expect(course.coins.map((coin) => coin.photoRef)).toEqual(['photo-1', 'photo-2', 'photo-3', 'missing-photo'])
    expect(course.checkpoints).toHaveLength(3)
    expect(course.goal.x).toBeGreaterThan(course.checkpoints[2].x)
  })

  it('swaps obstacle presets into the same slots', () => {
    const template = buildCourse01()
    const easy = compileCourse(template, presetForDifficulty('easy'), coins)
    const normal = compileCourse(template, presetForDifficulty('normal'), coins)
    const hard = compileCourse(template, presetForDifficulty('hard'), coins)
    const groundWidth = (solids: { y: number; w: number }[]) =>
      solids.filter((solid) => solid.y === GROUND_Y).reduce((sum, solid) => sum + solid.w, 0)
    const thornWidth = (hazards: { w: number }[]) => hazards.reduce((sum, hazard) => sum + hazard.w, 0)
    expect(easy.hazards.length).toBeLessThan(normal.hazards.length)
    expect(thornWidth(hard.hazards)).toBeGreaterThan(thornWidth(easy.hazards))
    expect(groundWidth(hard.solids)).toBeLessThan(groundWidth(normal.solids))
    expect(groundWidth(normal.solids)).toBeLessThan(groundWidth(easy.solids))
    const slot = template.slots.find((entry) => entry.id === 'obs-1')
    expect(slot).toBeTruthy()
    const covers = (solids: { x: number; y: number; w: number }[]) =>
      solids.some((solid) => solid.y === GROUND_Y && slot!.x >= solid.x && slot!.x < solid.x + solid.w)
    expect(covers(easy.solids)).toBe(true)
    expect(covers(hard.solids)).toBe(false)
    expect(hard.moving.every((platform) => platform.period < 2)).toBe(true)
  })
})
