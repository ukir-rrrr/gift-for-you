import type { PaletteHex } from './palette'

export type PartKind = 'hair' | 'skin' | 'outfit'

export type HeroPart = {
  id: string
  kind: PartKind
  fill: PaletteHex
  shade: PaletteHex
  file: string
}

export const HERO_PARTS: readonly HeroPart[] = [
  { id: 'hair-short', kind: 'hair', fill: '#3a2418', shade: '#1a1614', file: 'hero/hair-short.png' },
  { id: 'hair-bob', kind: 'hair', fill: '#5c3a28', shade: '#3a2418', file: 'hero/hair-bob.png' },
  { id: 'skin-light', kind: 'skin', fill: '#e8c4a0', shade: '#c9926a', file: 'hero/skin-light.png' },
  { id: 'skin-deep', kind: 'skin', fill: '#8d5a3c', shade: '#5c3a28', file: 'hero/skin-deep.png' },
  { id: 'outfit-shirt', kind: 'outfit', fill: '#4a6580', shade: '#2c3a48', file: 'hero/outfit-shirt.png' },
  { id: 'outfit-coat', kind: 'outfit', fill: '#6b3030', shade: '#5c3a28', file: 'hero/outfit-coat.png' },
]

export const DEFAULT_HERO = {
  hairId: 'hair-bob',
  skinId: 'skin-light',
  outfitId: 'outfit-shirt',
} as const

export function heroPart(id: string): HeroPart {
  const part = HERO_PARTS.find((entry) => entry.id === id)
  if (!part) throw new Error(`unknown hero part ${id}`)
  return part
}
