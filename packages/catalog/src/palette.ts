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
