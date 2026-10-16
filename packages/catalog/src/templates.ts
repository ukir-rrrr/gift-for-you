import type { Difficulty } from '@gfy/schema'
import { COURSE_01_COINS } from './course'

export type TemplateInfo = {
  id: string
  name: string
  blurb: string
  /** Coins beyond this count would have no slot on the course and never show. */
  coinSlots: number
}

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: 'course-01',
    name: 'はじまりの丘',
    blurb: '草原から丘の上まで、思い出を拾いながら歩くコース',
    coinSlots: COURSE_01_COINS.length,
  },
]

export const DIFFICULTIES: readonly { id: Difficulty; name: string; blurb: string }[] = [
  { id: 'easy', name: 'やさしい', blurb: 'ゲームが苦手な人でも歩けば着く' },
  { id: 'normal', name: 'ふつう', blurb: 'ちょっとジャンプが楽しい' },
  { id: 'hard', name: 'むずかしい', blurb: 'ゲーム好きな人に' },
]

export function templateById(id: string): TemplateInfo | undefined {
  return TEMPLATES.find((entry) => entry.id === id)
}
