import type { PaletteHex } from './palette'

export type PartKind = 'hair' | 'skin' | 'outfit'

// Share-schema vocabulary only: the player draws one pre-made hero sheet and
// does not recolour it per part.
export type HeroPart = {
  id: string
  kind: PartKind
  fill: PaletteHex
  shade: PaletteHex
}

export const HERO_PARTS: readonly HeroPart[] = [
  { id: 'hair-short', kind: 'hair', fill: '#3a2418', shade: '#1a1614' },
  { id: 'hair-bob', kind: 'hair', fill: '#5c3a28', shade: '#3a2418' },
  { id: 'skin-light', kind: 'skin', fill: '#e8c4a0', shade: '#c9926a' },
  { id: 'skin-deep', kind: 'skin', fill: '#8d5a3c', shade: '#5c3a28' },
  { id: 'outfit-shirt', kind: 'outfit', fill: '#4a6580', shade: '#2c3a48' },
  { id: 'outfit-coat', kind: 'outfit', fill: '#6b3030', shade: '#5c3a28' },
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
