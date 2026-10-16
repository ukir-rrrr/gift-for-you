export const PALETTE = [
  '#1a1614',
  '#2a2118',
  '#3d3228',
  '#5c4638',
  '#7a6248',
  '#a08468',
  '#e8c4a0',
  '#c9926a',
  '#8d5a3c',
  '#5c3a28',
  '#3a2418',
  '#c9a36a',
  '#6b3e26',
  '#a84c3a',
  '#9aa0a4',
  '#4a3a48',
  '#4a6580',
  '#3d6b68',
  '#5a7a4a',
  '#6d7f6a',
  '#8fadc0',
  '#c5d4dc',
  '#d8c9b0',
  '#6b3030',
  '#3a4a38',
  '#2c3a48',
  '#b8a090',
  '#4e5c48',
] as const

// Shared 32-colour palette of the hand-made sprite pack in public/assets/gfy.
export const ART_PALETTE = [
  '#e4f1f9',
  '#fff8d6',
  '#ddf0f8',
  '#bedff3',
  '#fae5aa',
  '#eed5ad',
  '#ffe27a',
  '#efc289',
  '#81b6e5',
  '#70a8e0',
  '#8caeb0',
  '#82a6a8',
  '#bbb057',
  '#bc9766',
  '#708f82',
  '#89aa26',
  '#a66732',
  '#5e7156',
  '#625b56',
  '#735739',
  '#5b6c32',
  '#44563f',
  '#723f1f',
  '#4c5130',
  '#623b1d',
  '#6b3017',
  '#3f3b37',
  '#4d3724',
  '#333325',
  '#462712',
  '#301c0e',
  '#1f140b',
] as const

export type PaletteHex = (typeof PALETTE)[number]

const PALETTE_SET = new Set<string>(PALETTE)

export function isPaletteHex(value: string): value is PaletteHex {
  return PALETTE_SET.has(value.toLowerCase())
}

export const SKY = '#8fadc0'
export const HILL = '#6d7f6a'
export const GRASS = '#5a7a4a'
export const OUTLINE = '#2a2118'
export const INK = '#1a1614'
