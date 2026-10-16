export const GROUND_Y = 272
export const COURSE_HEIGHT = 320
export const WALKER_W = 14
export const WALKER_H = 12
export const THORN_H = 12
export const PLATFORM_W = 32
export const PLATFORM_H = 16
export const STEP_W = 40
export const STEP_RUN = 36

export type Beat = { run: number; gap: number }

/** Raised ground near the goal, measured from the start of the last segment. */
export type Terrace = { offset: number; lift: number; w: number }

/**
 * One course as data: nine ground segments (beats), three sections of three segments, eight
 * obstacle slots the presets fill (obs-1..obs-8), coin slots, and the terraces before the goal.
 * Every course shares the slot ids, so one preset per difficulty works on all of them.
 */
export type CourseDef = {
  id: string
  beats: readonly Beat[]
  sections: readonly { id: string; name: string; segments: readonly number[] }[]
  slots: readonly { id: string; segment: number; offset: number; sectionId: string }[]
  coins: readonly { order: number; segment: number; offset: number; sectionId: string }[]
  terraces: readonly Terrace[]
}

export const COURSE_01_BEATS: readonly Beat[] = [
  { run: 820, gap: 24 },
  { run: 700, gap: 24 },
  { run: 680, gap: 24 },
  { run: 740, gap: 24 },
  { run: 660, gap: 24 },
  { run: 720, gap: 24 },
  { run: 700, gap: 24 },
  { run: 760, gap: 24 },
  { run: 900, gap: 0 },
]

export const COURSE_01_SECTIONS = [
  { id: 'meet', name: '出会いの道', segments: [0, 1, 2] },
  { id: 'memory', name: '思い出の小道', segments: [3, 4, 5] },
  { id: 'hill', name: 'ゴールの丘', segments: [6, 7, 8] },
] as const

export const COURSE_01_SLOTS = [
  { id: 'obs-1', segment: 0, offset: 420, sectionId: 'meet' },
  { id: 'obs-2', segment: 1, offset: 300, sectionId: 'meet' },
  { id: 'obs-3', segment: 2, offset: 280, sectionId: 'meet' },
  { id: 'obs-4', segment: 3, offset: 360, sectionId: 'memory' },
  { id: 'obs-5', segment: 4, offset: 240, sectionId: 'memory' },
  { id: 'obs-6', segment: 5, offset: 300, sectionId: 'memory' },
  { id: 'obs-7', segment: 6, offset: 280, sectionId: 'hill' },
  { id: 'obs-8', segment: 7, offset: 320, sectionId: 'hill' },
] as const

export const COURSE_01_COINS = [
  { order: 1, segment: 0, offset: 240, sectionId: 'meet' },
  { order: 2, segment: 2, offset: 180, sectionId: 'meet' },
  { order: 3, segment: 4, offset: 160, sectionId: 'memory' },
  { order: 4, segment: 7, offset: 180, sectionId: 'hill' },
] as const

export const COURSE_01: CourseDef = {
  id: 'course-01',
  beats: COURSE_01_BEATS,
  sections: COURSE_01_SECTIONS,
  slots: COURSE_01_SLOTS,
  coins: COURSE_01_COINS,
  terraces: [
    { offset: 240, lift: 16, w: 150 },
    { offset: 390, lift: 32, w: 170 },
    { offset: 560, lift: 48, w: 340 },
  ],
}

/** Seaside: longer flat runs along the shore, obstacles bunched on the pier, a lighthouse cape to finish. */
export const COURSE_02: CourseDef = {
  id: 'course-02',
  beats: [
    { run: 760, gap: 24 },
    { run: 740, gap: 24 },
    { run: 640, gap: 24 },
    { run: 700, gap: 24 },
    { run: 720, gap: 24 },
    { run: 680, gap: 24 },
    { run: 760, gap: 24 },
    { run: 700, gap: 24 },
    { run: 880, gap: 0 },
  ],
  sections: [
    { id: 'shore', name: '砂浜の道', segments: [0, 1, 2] },
    { id: 'pier', name: '桟橋', segments: [3, 4, 5] },
    { id: 'cape', name: '灯台の岬', segments: [6, 7, 8] },
  ],
  slots: [
    { id: 'obs-1', segment: 0, offset: 460, sectionId: 'shore' },
    { id: 'obs-2', segment: 1, offset: 420, sectionId: 'shore' },
    { id: 'obs-3', segment: 2, offset: 300, sectionId: 'shore' },
    { id: 'obs-4', segment: 3, offset: 320, sectionId: 'pier' },
    { id: 'obs-5', segment: 4, offset: 360, sectionId: 'pier' },
    { id: 'obs-6', segment: 5, offset: 260, sectionId: 'pier' },
    { id: 'obs-7', segment: 6, offset: 400, sectionId: 'cape' },
    { id: 'obs-8', segment: 7, offset: 260, sectionId: 'cape' },
  ],
  coins: [
    { order: 1, segment: 0, offset: 200, sectionId: 'shore' },
    { order: 2, segment: 1, offset: 200, sectionId: 'shore' },
    { order: 3, segment: 3, offset: 160, sectionId: 'pier' },
    { order: 4, segment: 5, offset: 520, sectionId: 'pier' },
    { order: 5, segment: 7, offset: 520, sectionId: 'cape' },
  ],
  terraces: [
    { offset: 200, lift: 16, w: 120 },
    { offset: 320, lift: 32, w: 120 },
    { offset: 440, lift: 48, w: 120 },
    { offset: 560, lift: 64, w: 320 },
  ],
}

/** Night forest: shorter segments early, a lake in the middle, a wide, low hill under the stars. */
export const COURSE_03: CourseDef = {
  id: 'course-03',
  beats: [
    { run: 700, gap: 24 },
    { run: 660, gap: 24 },
    { run: 720, gap: 24 },
    { run: 780, gap: 24 },
    { run: 640, gap: 24 },
    { run: 760, gap: 24 },
    { run: 680, gap: 24 },
    { run: 740, gap: 24 },
    { run: 920, gap: 0 },
  ],
  sections: [
    { id: 'woods', name: '森の入口', segments: [0, 1, 2] },
    { id: 'lake', name: '湖のほとり', segments: [3, 4, 5] },
    { id: 'stars', name: '星見の丘', segments: [6, 7, 8] },
  ],
  slots: [
    { id: 'obs-1', segment: 0, offset: 360, sectionId: 'woods' },
    { id: 'obs-2', segment: 1, offset: 260, sectionId: 'woods' },
    { id: 'obs-3', segment: 2, offset: 440, sectionId: 'woods' },
    { id: 'obs-4', segment: 3, offset: 460, sectionId: 'lake' },
    { id: 'obs-5', segment: 4, offset: 300, sectionId: 'lake' },
    { id: 'obs-6', segment: 5, offset: 420, sectionId: 'lake' },
    { id: 'obs-7', segment: 6, offset: 320, sectionId: 'stars' },
    { id: 'obs-8', segment: 7, offset: 420, sectionId: 'stars' },
  ],
  coins: [
    { order: 1, segment: 0, offset: 180, sectionId: 'woods' },
    { order: 2, segment: 2, offset: 200, sectionId: 'woods' },
    { order: 3, segment: 3, offset: 220, sectionId: 'lake' },
    { order: 4, segment: 4, offset: 160, sectionId: 'lake' },
    { order: 5, segment: 6, offset: 160, sectionId: 'stars' },
    { order: 6, segment: 7, offset: 200, sectionId: 'stars' },
  ],
  terraces: [
    { offset: 280, lift: 16, w: 200 },
    { offset: 480, lift: 32, w: 380 },
  ],
}

export const COURSE_DEFS: readonly CourseDef[] = [COURSE_01, COURSE_02, COURSE_03]

export type Rect = { id: string; x: number; y: number; w: number; h: number }

export type CourseTemplate = {
  id: string
  width: number
  height: number
  sections: { id: string; name: string; x0: number; x1: number }[]
  solids: Rect[]
  slots: { id: string; x: number; sectionId: string }[]
  coinSlots: { order: number; x: number; y: number; sectionId: string }[]
  checkpoints: { id: string; x: number; y: number; sectionId: string }[]
  goal: { x: number; y: number }
  spawn: { x: number; y: number }
}

type Segment = { x: number; w: number }

function expandBeats(beats: readonly Beat[]): { segments: Segment[]; end: number } {
  const segments: Segment[] = []
  let cursor = 0
  for (const beat of beats) {
    segments.push({ x: cursor, w: beat.run })
    cursor += beat.run + beat.gap
  }
  return { segments, end: cursor }
}

export function buildCourse(def: CourseDef): CourseTemplate {
  const { segments, end } = expandBeats(def.beats)
  const solids: Rect[] = segments.map((segment, index) => ({
    id: `ground-${index}`,
    x: segment.x,
    y: GROUND_Y,
    w: segment.w,
    h: COURSE_HEIGHT - GROUND_Y,
  }))
  const last = segments[segments.length - 1]
  for (const terrace of def.terraces) {
    const y = GROUND_Y - terrace.lift
    solids.push({
      id: `hill-${terrace.offset}`,
      x: last.x + terrace.offset,
      y,
      w: terrace.w,
      h: COURSE_HEIGHT - y,
    })
  }
  const sections = def.sections.map((section) => {
    const indexes = section.segments
    return {
      id: section.id,
      name: section.name,
      x0: segments[indexes[0]].x,
      x1: segments[indexes[indexes.length - 1]].x + segments[indexes[indexes.length - 1]].w,
    }
  })
  const top = def.terraces.reduce((max, terrace) => Math.max(max, terrace.lift), 0)
  return {
    id: def.id,
    width: end + 48,
    height: COURSE_HEIGHT,
    sections,
    solids,
    slots: def.slots.map((slot) => ({
      id: slot.id,
      x: segments[slot.segment].x + slot.offset,
      sectionId: slot.sectionId,
    })),
    coinSlots: def.coins.map((coin) => ({
      order: coin.order,
      x: segments[coin.segment].x + coin.offset,
      y: GROUND_Y - 32,
      sectionId: coin.sectionId,
    })),
    // One checkpoint at the start of each section.
    checkpoints: def.sections.map((section, index) => ({
      id: `cp-${section.id}`,
      x: index === 0 ? 40 : segments[section.segments[0]].x + 24,
      y: GROUND_Y,
      sectionId: section.id,
    })),
    goal: { x: last.x + last.w - 70, y: GROUND_Y - top },
    spawn: { x: 40, y: GROUND_Y },
  }
}

export function buildCourse01(): CourseTemplate {
  return buildCourse(COURSE_01)
}

/** The course for a template id; unknown ids have no course. */
export function buildCourseFor(templateId: string): CourseTemplate | null {
  const def = COURSE_DEFS.find((entry) => entry.id === templateId)
  return def ? buildCourse(def) : null
}

export function buildCourseE2E(): CourseTemplate {
  return {
    id: 'course-e2e',
    width: 960,
    height: COURSE_HEIGHT,
    sections: [{ id: 'meet', name: '出会いの道', x0: 0, x1: 960 }],
    solids: [{ id: 'ground', x: 0, y: GROUND_Y, w: 960, h: COURSE_HEIGHT - GROUND_Y }],
    slots: [],
    coinSlots: [{ order: 1, x: 280, y: GROUND_Y - 32, sectionId: 'meet' }],
    checkpoints: [{ id: 'cp0', x: 40, y: GROUND_Y, sectionId: 'meet' }],
    goal: { x: 700, y: GROUND_Y },
    spawn: { x: 40, y: GROUND_Y },
  }
}
