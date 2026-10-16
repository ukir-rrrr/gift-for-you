import { parseShareJson } from '@gfy/schema'
import { describe, expect, it } from 'vitest'
import {
  ART_PALETTE,
  COURSE_HEIGHT,
  GROUND_Y,
  PALETTE,
  SAMPLE_SHARES,
  STEP_W,
  WALKER_H,
  WALKER_W,
  WALK_6,
  WALK_8,
  buildCourse01,
  catalogIndex,
  compileCourse,
  frameDurationSeconds,
  moversOf,
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
    expect(new Set(ART_PALETTE).size).toBe(32)
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
    expect(moversOf(hard, 'solid').every((platform) => platform.period < 2)).toBe(true)
    expect(moversOf(easy, 'solid')).toHaveLength(1)
    expect(moversOf(easy, 'stompable')).toHaveLength(1)
    expect(moversOf(normal, 'stompable').length).toBeGreaterThan(0)
    expect(moversOf(hard, 'stompable').length).toBeGreaterThan(0)
    const stepSlot = template.slots.find((entry) => entry.id === 'obs-1')
    const walkerSlot = template.slots.find((entry) => entry.id === 'obs-2')
    expect(stepSlot && walkerSlot).toBeTruthy()
    expect(easy.solids.find((solid) => solid.id === 'obs-1-step-0')).toEqual({
      id: 'obs-1-step-0',
      x: stepSlot!.x,
      y: GROUND_Y - 16,
      w: STEP_W,
      h: COURSE_HEIGHT - (GROUND_Y - 16),
    })
    expect(moversOf(easy, 'stompable')[0]).toMatchObject({
      id: 'obs-2',
      originX: walkerSlot!.x + 10,
      y: GROUND_Y - WALKER_H,
      w: WALKER_W,
      h: WALKER_H,
      travel: 22,
      period: 3.6,
    })
  })
})

describe('templates', () => {
  it('lists every template the index accepts with its coin slot count', async () => {
    const { TEMPLATES, catalogIndex, buildCourse01 } = await import('../src/index')
    expect(catalogIndex().templateIds).toEqual(TEMPLATES.map((t) => t.id))
    expect(TEMPLATES[0].coinSlots).toBe(buildCourse01().coinSlots.length)
  })
})

describe('phase 3 catalog (F3-01, F3-02)', () => {
  it('ships three themed templates built from course data', async () => {
    const { TEMPLATES, COURSE_DEFS, buildCourseFor, THEMES } = await import('../src/index')
    expect(TEMPLATES.map((t) => t.id)).toEqual(['course-01', 'course-02', 'course-03'])
    expect(new Set(TEMPLATES.map((t) => t.theme)).size).toBe(3)
    for (const template of TEMPLATES) {
      const course = buildCourseFor(template.id)!
      expect(course.id).toBe(template.id)
      expect(course.coinSlots).toHaveLength(template.coinSlots)
      expect(course.sections).toHaveLength(3)
      expect(course.slots.map((slot) => slot.id)).toEqual(['obs-1', 'obs-2', 'obs-3', 'obs-4', 'obs-5', 'obs-6', 'obs-7', 'obs-8'])
      expect(THEMES[template.theme]).toBeTruthy()
      // Roughly two minutes at 60 px/s.
      expect(course.width / 60).toBeGreaterThan(100)
      expect(course.width / 60).toBeLessThan(130)
    }
    expect(COURSE_DEFS).toHaveLength(3)
    expect(buildCourseFor('nope')).toBeNull()
  })

  it('keeps course-01 exactly as Phase 1 built it', async () => {
    const course = buildCourse01()
    expect(course.checkpoints.map((cp) => cp.id)).toEqual(['cp-meet', 'cp-memory', 'cp-hill'])
    expect(course.goal).toEqual({ x: 6802, y: GROUND_Y - 48 })
  })

  it('lists about twenty gift items with unique ids in known categories', async () => {
    const { GIFT_ITEMS, GIFT_CATEGORIES } = await import('../src/index')
    expect(GIFT_ITEMS.length).toBe(20)
    expect(new Set(GIFT_ITEMS.map((item) => item.id)).size).toBe(GIFT_ITEMS.length)
    const categories = new Set(GIFT_CATEGORIES.map((c) => c.id))
    for (const item of GIFT_ITEMS) expect(categories.has(item.category)).toBe(true)
  })
})
