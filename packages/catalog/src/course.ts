export const GROUND_Y = 272
export const COURSE_HEIGHT = 320

export type Beat = { run: number; gap: number }

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

export function buildCourse01(): CourseTemplate {
  const { segments, end } = expandBeats(COURSE_01_BEATS)
  const solids: Rect[] = segments.map((segment, index) => ({
    id: `ground-${index}`,
    x: segment.x,
    y: GROUND_Y,
    w: segment.w,
    h: COURSE_HEIGHT - GROUND_Y,
  }))
  const hills = [
    { offset: 240, lift: 16, w: 150 },
    { offset: 390, lift: 32, w: 170 },
    { offset: 560, lift: 48, w: 340 },
  ]
  const last = segments[8]
  for (const hill of hills) {
    const y = GROUND_Y - hill.lift
    solids.push({
      id: `hill-${hill.offset}`,
      x: last.x + hill.offset,
      y,
      w: hill.w,
      h: COURSE_HEIGHT - y,
    })
  }
  const sections = COURSE_01_SECTIONS.map((section) => {
    const indexes = section.segments
    return {
      id: section.id,
      name: section.name,
      x0: segments[indexes[0]].x,
      x1: segments[indexes[indexes.length - 1]].x + segments[indexes[indexes.length - 1]].w,
    }
  })
  return {
    id: 'course-01',
    width: end + 48,
    height: COURSE_HEIGHT,
    sections,
    solids,
    slots: COURSE_01_SLOTS.map((slot) => ({
      id: slot.id,
      x: segments[slot.segment].x + slot.offset,
      sectionId: slot.sectionId,
    })),
    coinSlots: COURSE_01_COINS.map((coin) => ({
      order: coin.order,
      x: segments[coin.segment].x + coin.offset,
      y: GROUND_Y - 32,
      sectionId: coin.sectionId,
    })),
    checkpoints: [
      { id: 'cp-meet', x: 40, y: GROUND_Y, sectionId: 'meet' },
      { id: 'cp-memory', x: segments[3].x + 24, y: GROUND_Y, sectionId: 'memory' },
      { id: 'cp-hill', x: segments[6].x + 24, y: GROUND_Y, sectionId: 'hill' },
    ],
    goal: { x: last.x + last.w - 70, y: GROUND_Y - 48 },
    spawn: { x: 40, y: GROUND_Y },
  }
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
