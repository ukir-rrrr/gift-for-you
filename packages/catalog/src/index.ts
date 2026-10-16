import type { CatalogIndex } from '@gfy/schema'
import { BGM_IDS, GIFT_ITEMS, REVEAL_IDS } from './gifts'
import { HERO_PARTS } from './hero'
import { PALETTE } from './palette'
import demoShare from '../samples/demo.share.json'
import expiredShare from '../samples/expired.share.json'
import offlistShare from '../samples/offlist.share.json'
import demoReveal from '../samples/demo.reveal.json'
import offlistReveal from '../samples/offlist.reveal.json'

export { CATALOG_VERSION, GIFT_ITEMS, giftItem } from './gifts'
export type { GiftItemId } from './gifts'
export { HERO_PARTS, DEFAULT_HERO, heroPart } from './hero'
export type { HeroPart, PartKind } from './hero'
export { PALETTE, SKY, HILL, GRASS, OUTLINE, INK, isPaletteHex } from './palette'
export type { PaletteHex } from './palette'
export { PRESETS, presetById, presetForDifficulty } from './presets'
export type { ObstacleFill, ObstaclePreset } from './presets'
export {
  GROUND_Y,
  COURSE_HEIGHT,
  COURSE_01_BEATS,
  buildCourse01,
  buildCourseE2E,
} from './course'
export type { CourseTemplate, Rect } from './course'
export { compileCourse, movingPlatformX, solidsAt, walkerX } from './compile'
export type { CoinInput, MovingPlatform, RuntimeCoin, RuntimeCourse, Walker } from './compile'
export {
  ANIM_INDEX,
  POSE_FRAMES,
  SHEET_FRAMES,
  SHEET_FRAME_H,
  SHEET_FRAME_W,
  WALK_6,
  WALK_8,
  cycleDurationSeconds,
  frameDurationSeconds,
  heroFrameFor,
  plantedSlide,
  remapWalkFrame,
  stridePx,
  toggleFrameCount,
  walkCycle,
} from './walk'
export type { Foot, FootPose, HeroFrame, PlantFrame, PoseName, WalkCycle, WalkFrameCount } from './walk'

export function catalogIndex(): CatalogIndex {
  return {
    templateIds: ['course-01'],
    itemIds: GIFT_ITEMS.map((item) => item.id),
    revealIds: [...REVEAL_IDS],
    bgmIds: [...BGM_IDS],
    hairIds: HERO_PARTS.filter((part) => part.kind === 'hair').map((part) => part.id),
    skinIds: HERO_PARTS.filter((part) => part.kind === 'skin').map((part) => part.id),
    outfitIds: HERO_PARTS.filter((part) => part.kind === 'outfit').map((part) => part.id),
    palette: [...PALETTE],
    presetsByDifficulty: {
      easy: ['preset-easy'],
      normal: ['preset-normal'],
      hard: ['preset-hard'],
    },
  }
}

export const SAMPLE_SHARES = {
  demo: demoShare,
  expired: expiredShare,
  offlist: offlistShare,
} as const

export const SAMPLE_REVEALS = {
  demo: demoReveal,
  offlist: offlistReveal,
} as const

export const KNOWN_GIFT_IDS = ['demo', 'expired', 'offlist'] as const
