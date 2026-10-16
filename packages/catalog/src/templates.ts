import type { Difficulty } from '@gfy/schema'
import { COURSE_DEFS } from './course'
import type { PaletteHex } from './palette'

export type ThemeId = 'meadow' | 'seaside' | 'night'

/**
 * How the player paints the shared parallax art for a course. Everything is a runtime overlay on
 * the same sprite pack (the canvas renderer has no tint), so a new theme needs no new PNGs.
 */
export type Theme = {
  id: ThemeId
  /** Camera background behind the sky layer. */
  background: PaletteHex
  /** Wash over the sky and mountains, with its opacity. */
  skyWash: { color: PaletteHex; alpha: number } | null
  /** Wash over the whole backdrop, ground excluded. */
  dusk: { color: PaletteHex; alpha: number } | null
  /** A flat band (the sea) drawn instead of the forest layer. */
  band: { color: PaletteHex; crest: PaletteHex } | null
  /** Small fixed stars in the sky. */
  stars: number
}

export const THEMES: Record<ThemeId, Theme> = {
  meadow: { id: 'meadow', background: '#8fadc0', skyWash: null, dusk: null, band: null, stars: 0 },
  seaside: {
    id: 'seaside',
    background: '#c9926a',
    skyWash: { color: '#c9926a', alpha: 0.5 },
    dusk: null,
    band: { color: '#4a6580', crest: '#c5d4dc' },
    stars: 0,
  },
  night: {
    id: 'night',
    background: '#2c3a48',
    skyWash: { color: '#2c3a48', alpha: 0.55 },
    dusk: { color: '#2c3a48', alpha: 0.3 },
    band: null,
    stars: 14,
  },
}

export type TemplateInfo = {
  id: string
  name: string
  blurb: string
  theme: ThemeId
  /** Coins beyond this count would have no slot on the course and never show. */
  coinSlots: number
}

const coinsOf = (id: string) => COURSE_DEFS.find((def) => def.id === id)?.coins.length ?? 0

export const TEMPLATES: readonly TemplateInfo[] = [
  {
    id: 'course-01',
    name: 'はじまりの丘',
    blurb: '草原から丘の上まで、思い出を拾いながら歩くコース',
    theme: 'meadow',
    coinSlots: coinsOf('course-01'),
  },
  {
    id: 'course-02',
    name: '夕暮れの海辺',
    blurb: '砂浜と桟橋をわたって、灯台の岬をめざす夕方のコース',
    theme: 'seaside',
    coinSlots: coinsOf('course-02'),
  },
  {
    id: 'course-03',
    name: '星降る夜の森',
    blurb: '森をぬけて湖をこえ、星の見える丘まで歩く夜のコース',
    theme: 'night',
    coinSlots: coinsOf('course-03'),
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

export function themeOf(templateId: string): Theme {
  return THEMES[templateById(templateId)?.theme ?? 'meadow']
}
