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
  plantedSlide,
  presetForDifficulty,
  remapWalkFrame,
  stridePx,
  toggleFrameCount,
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
    expect(stridePx(WALK_6)).toBe(12)
    expect(stridePx(WALK_8)).toBe(16)
    expect(plantedSlide(WALK_6, 'left')).toBe(0)
    expect(plantedSlide(WALK_6, 'right')).toBe(0)
    expect(plantedSlide(WALK_8, 'left')).toBe(0)
    expect(plantedSlide(WALK_8, 'right')).toBe(0)
    expect(frameDurationSeconds(12, 60, 6)).toBeCloseTo(12 / 60 / 6)
    expect(frameDurationSeconds(12, 0, 6)).toBe(Number.POSITIVE_INFINITY)
  })

  it('alternates arms and feet, and remaps 6 <-> 8 without leaving the sheet', () => {
    expect(WALK_6.frames.map((frame) => frame.arm)).toEqual(expect.arrayContaining([1, -1]))
    expect(WALK_8.frames.map((frame) => frame.arm)).toEqual(expect.arrayContaining([1, -1]))
    expect(WALK_6.plants.map((plant) => plant.foot)).toEqual(expect.arrayContaining(['left', 'right']))
    const left = WALK_6.plants.find((plant) => plant.foot === 'left')
    const right = WALK_6.plants.find((plant) => plant.foot === 'right')
    expect(left && right && right.frame > left.frame).toBe(true)
    expect(toggleFrameCount(6)).toBe(8)
    const remapped = remapWalkFrame(7, 8, 6)
    expect(remapped).toBeGreaterThanOrEqual(0)
    expect(remapped).toBeLessThan(6)
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
    expect(easy.moving.length).toBeGreaterThan(0)
    expect(easy.walkers.length).toBeGreaterThan(0)
    expect(normal.walkers.length).toBeGreaterThan(0)
    expect(hard.walkers.length).toBeGreaterThan(0)
    expect(easy.solids.some((solid) => solid.y < GROUND_Y)).toBe(true)
    expect(easy.solids.some((solid) => solid.id.startsWith('obs-1-step'))).toBe(true)
  })
})
