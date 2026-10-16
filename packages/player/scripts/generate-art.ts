import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { OUTLINE, PALETTE, SKY } from '@gfy/catalog'
import { PNG } from 'pngjs'
import { ITEM_SPRITES, LEGEND } from './item-sprites'

// Hero, tiles, props, pedestal and parallax come from the hand-made pack in
// public/assets/gfy; this script only draws items, photos and small fx.
const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets')
const palette = new Set<string>(PALETTE)

type Grid = (string | null)[][]

function grid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null))
}

function fillEllipse(g: Grid, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) g[y][x] = color
    }
  }
}

function png(width: number, height: number) {
  const image = new PNG({ width, height, colorType: 6 })
  image.data.fill(0)
  return image
}

function hex(value: string): [number, number, number] {
  const n = Number.parseInt(value.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function paintHex(image: PNG, x: number, y: number, color: string) {
  if (!palette.has(color)) throw new Error(`off palette ${color}`)
  const [r, c, b] = hex(color)
  const i = (y * image.width + x) * 4
  image.data[i] = r
  image.data[i + 1] = c
  image.data[i + 2] = b
  image.data[i + 3] = 255
}

function write(path: string, image: PNG) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, PNG.sync.write(image))
}

function spark() {
  const image = png(5, 5)
  paintHex(image, 2, 0, '#c5d4dc')
  paintHex(image, 2, 4, '#c5d4dc')
  paintHex(image, 0, 2, '#c5d4dc')
  paintHex(image, 4, 2, '#c5d4dc')
  paintHex(image, 2, 2, '#d8c9b0')
  write(join(root, 'fx/spark.png'), image)
}

function ray() {
  const image = png(9, 28)
  for (let y = 0; y < 28; y++) {
    const w = y < 6 ? 1 : 1 + Math.floor((y - 6) / 10)
    for (let x = 4 - w; x <= 4 + w; x++) paintHex(image, x, y, y < 8 ? '#c5d4dc' : '#8fadc0')
  }
  write(join(root, 'fx/ray.png'), image)
}

function itemPng(draw: (image: PNG) => void, name: string) {
  const image = png(24, 24)
  draw(image)
  write(join(root, `items/${name}.png`), image)
}

function items() {
  itemPng((image) => {
    for (let y = 6; y < 16; y++) {
      paintHex(image, 4, y, OUTLINE)
      paintHex(image, 19, y, OUTLINE)
    }
    for (let x = 5; x < 19; x++) {
      paintHex(image, x, 7, '#2c3a48')
      paintHex(image, x, 8, '#4a6580')
      paintHex(image, x, 9, '#4a6580')
      paintHex(image, x, 10, '#2c3a48')
      paintHex(image, x, 13, '#4a6580')
      paintHex(image, x, 14, '#2c3a48')
    }
    rectHex(image, 8, 4, 8, 3, '#4a6580')
    paintHex(image, 8, 4, OUTLINE)
    paintHex(image, 15, 4, OUTLINE)
    paintHex(image, 5, 16, '#2c3a48')
    paintHex(image, 6, 17, '#4a6580')
    paintHex(image, 17, 16, '#2c3a48')
    paintHex(image, 18, 17, '#4a6580')
  }, 'scarf')
  itemPng((image) => {
    rectHex(image, 6, 7, 11, 11, '#d8c9b0')
    for (let x = 6; x < 17; x++) paintHex(image, x, 7, OUTLINE)
    for (let y = 7; y < 18; y++) {
      paintHex(image, 6, y, OUTLINE)
      paintHex(image, 16, y, OUTLINE)
    }
    rectHex(image, 7, 9, 9, 4, '#c5d4dc')
    rectHex(image, 16, 10, 4, 6, '#b8a090')
    paintHex(image, 19, 10, OUTLINE)
    paintHex(image, 19, 15, OUTLINE)
    rectHex(image, 6, 17, 11, 3, '#a08468')
    paintHex(image, 10, 5, '#c5d4dc')
    paintHex(image, 12, 4, '#c5d4dc')
  }, 'mug')
  itemPng((image) => {
    rectHex(image, 6, 3, 12, 18, '#6b3030')
    for (let x = 6; x < 18; x++) {
      paintHex(image, x, 3, OUTLINE)
      paintHex(image, x, 20, OUTLINE)
    }
    rectHex(image, 7, 4, 10, 16, '#d8c9b0')
    for (let y = 6; y < 18; y += 2) paintHex(image, 10, y, '#a08468')
    rectHex(image, 16, 4, 2, 16, '#b8a090')
  }, 'book')
  itemPng((image) => {
    for (const [x, y, color] of [
      [5, 5, '#a84c3a'],
      [10, 3, '#c9926a'],
      [15, 5, '#6b3030'],
      [8, 8, '#e8c4a0'],
      [13, 8, '#a84c3a'],
    ] as const) {
      rectHex(image, x, y, 4, 4, color)
      paintHex(image, x, y, OUTLINE)
    }
    for (let y = 11; y < 22; y++) paintHex(image, 12, y, '#3a4a38')
    paintHex(image, 11, 18, '#5a7a4a')
    paintHex(image, 13, 17, '#5a7a4a')
    paintHex(image, 10, 19, '#4e5c48')
  }, 'bouquet')
  itemPng((image) => {
    for (let y = 3; y < 10; y++) paintHex(image, 12, y, '#c9a36a')
    paintHex(image, 11, 5, '#c9a36a')
    paintHex(image, 13, 6, '#c9a36a')
    paintHex(image, 12, 3, OUTLINE)
    const g = grid(24, 24)
    fillEllipse(g, 12, 15, 5.0, 5.2, '#c9a36a')
    fillEllipse(g, 12, 15, 2.4, 2.6, '#a84c3a')
    stamp(image, g)
    paintHex(image, 12, 13, '#d8c9b0')
    paintHex(image, 8, 15, OUTLINE)
    paintHex(image, 16, 15, OUTLINE)
  }, 'pendant')
}

/** Phase 3 items: character maps, centred, standing on row 21. */
function spriteItems() {
  for (const [name, rows] of Object.entries(ITEM_SPRITES)) {
    const width = Math.max(...rows.map((row) => row.length))
    if (width > 24 || rows.length > 22) throw new Error(`${name} does not fit 24x24`)
    const left = Math.floor((24 - width) / 2)
    const top = 22 - rows.length
    itemPng((image) => {
      rows.forEach((row, y) => {
        for (const [x, ch] of [...row].entries()) {
          if (ch === '.') continue
          const color = LEGEND[ch]
          if (!color) throw new Error(`${name}: unknown colour key ${ch}`)
          paintHex(image, left + x, top + y, color)
        }
      })
    }, name)
  }
}

/**
 * Link-preview image (F3-08). Generic on purpose: no names, photos, or messages, so a shared link
 * never shows anything personal in a chat preview.
 */
function ogImage() {
  const w = 1200
  const h = 630
  const image = png(w, h)
  const fill = (x0: number, y0: number, rw: number, rh: number, color: string) => {
    for (let y = Math.max(0, y0); y < Math.min(h, y0 + rh); y++) for (let x = Math.max(0, x0); x < Math.min(w, x0 + rw); x++) paintHex(image, x, y, color)
  }
  fill(0, 0, w, h, SKY)
  fill(0, 470, w, 160, '#5a7a4a')
  fill(0, 470, w, 12, '#3a4a38')
  // Hills in big pixels.
  for (let i = 0; i < 12; i++) {
    const x = i * 110 - 20
    const top = 380 + ((i * 37) % 60)
    fill(x, top, 130, 470 - top, '#6d7f6a')
  }
  // A wrapped gift box on a pedestal, drawn with 20 px pixels.
  const px = 20
  const box = [
    '....yy..yy....',
    '...y..yy..y...',
    '....yyyyyy....',
    '.KKKKKKKKKKKK.',
    '.KRRRRyyRRRRK.',
    '.KRRRRyyRRRRK.',
    '.KyyyyyyyyyyK.',
    '.KRRRRyyRRRRK.',
    '.KRRRRyyRRRRK.',
    '.KRRRRyyRRRRK.',
    '.KKKKKKKKKKKK.',
    'KwwwwwwwwwwwwK',
    'KKKKKKKKKKKKKK',
  ]
  const colors: Record<string, string> = { K: OUTLINE, R: '#6b3030', y: '#c9a36a', w: '#d8c9b0' }
  const ox = Math.floor((w - box[0].length * px) / 2)
  const oy = 470 - box.length * px
  box.forEach((row, y) => {
    for (const [x, ch] of [...row].entries()) if (ch !== '.') fill(ox + x * px, oy + y * px, px, px, colors[ch])
  })
  for (const [x, y] of [[300, 120], [880, 90], [1010, 220], [180, 260], [760, 200]]) {
    fill(x, y, 20, 20, '#c5d4dc')
    fill(x - 20, y + 20, 60, 20, '#c5d4dc')
    fill(x, y + 40, 20, 20, '#c5d4dc')
  }
  write(join(root, '../og.png'), image)
}

function rectHex(image: PNG, x: number, y: number, w: number, h: number, color: string) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) paintHex(image, xx, yy, color)
}

function stamp(image: PNG, g: Grid) {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const color = g[y][x]
      if (!color || !color.startsWith('#')) continue
      paintHex(image, x, y, color)
    }
  }
}

function token() {
  const image = png(14, 14)
  for (let y = 1; y < 13; y++) {
    for (let x = 1; x < 13; x++) {
      const edge = x === 1 || y === 1 || x === 12 || y === 12
      const inner = x >= 4 && x <= 9 && y >= 4 && y <= 9
      const color = edge ? OUTLINE : inner ? '#c5d4dc' : '#d8c9b0'
      paintHex(image, x, y, color)
    }
  }
  paintHex(image, 6, 6, '#8fadc0')
  paintHex(image, 7, 7, '#5a7a4a')
  write(join(root, 'fx/token.png'), image)
}

function frame() {
  const image = png(52, 40)
  for (let y = 0; y < 40; y++) {
    for (let x = 0; x < 52; x++) {
      const inner = x >= 6 && x < 46 && y >= 6 && y < 34
      if (inner) continue
      const edge = x === 0 || y === 0 || x === 51 || y === 39
      const lip = x < 3 || y < 3 || x > 48 || y > 36
      paintHex(image, x, y, edge || lip ? OUTLINE : x < 6 || y < 6 ? '#d8c9b0' : '#c9a36a')
    }
  }
  write(join(root, 'fx/frame.png'), image)
}

function photo(name: string, draw: (image: PNG) => void) {
  const image = png(40, 28)
  for (let y = 0; y < 28; y++) for (let x = 0; x < 40; x++) paintHex(image, x, y, '#d8c9b0')
  draw(image)
  write(join(root, `photos/${name}.png`), image)
}

function photos() {
  photo('photo-1', (image) => {
    rectHex(image, 0, 0, 40, 12, SKY)
    rectHex(image, 6, 8, 10, 14, '#c5d4dc')
    rectHex(image, 8, 10, 6, 6, '#8fadc0')
    rectHex(image, 22, 16, 4, 12, '#4a6580')
    rectHex(image, 28, 16, 4, 12, '#6b3030')
    rectHex(image, 22, 12, 4, 4, '#e8c4a0')
    rectHex(image, 28, 12, 4, 4, '#c9926a')
  })
  photo('photo-2', (image) => {
    rectHex(image, 0, 0, 40, 28, '#4a6580')
    for (let i = 0; i < 12; i++) paintHex(image, 4 + ((i * 7) % 32), 2 + ((i * 5) % 20), '#c5d4dc')
    rectHex(image, 16, 10, 12, 8, '#2a2118')
    rectHex(image, 20, 8, 2, 6, '#2a2118')
    rectHex(image, 18, 18, 3, 10, '#5c3a28')
    rectHex(image, 23, 18, 3, 10, '#3a2418')
  })
  photo('photo-3', (image) => {
    rectHex(image, 0, 16, 40, 12, '#a08468')
    rectHex(image, 14, 8, 10, 8, '#d8c9b0')
    rectHex(image, 16, 6, 6, 3, '#c5d4dc')
    rectHex(image, 22, 12, 4, 3, '#b8a090')
    rectHex(image, 6, 4, 8, 10, '#5a7a4a')
  })
  photo('placeholder', (image) => {
    for (let y = 0; y < 28; y++) {
      for (let x = 0; x < 40; x++) {
        paintHex(image, x, y, (x + y) % 6 === 0 ? '#b8a090' : '#d8c9b0')
      }
    }
  })
}

spark()
ray()
items()
spriteItems()
ogImage()
token()
frame()
photos()
console.log(`art written to ${root}`)
