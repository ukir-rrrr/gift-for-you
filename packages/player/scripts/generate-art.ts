import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ANIM_INDEX,
  GRASS,
  HILL,
  HERO_PARTS,
  INK,
  OUTLINE,
  PALETTE,
  SHEET_FRAME_H,
  SHEET_FRAME_W,
  SHEET_FRAMES,
  SKY,
  WALK_6,
  WALK_8,
  walkCycle,
  type PlantFrame,
  type WalkCycle,
} from '@gfy/catalog'
import { PNG } from 'pngjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets')
const palette = new Set<string>(PALETTE)

type Grid = (string | null)[][]
type Pose =
  | { kind: 'idle'; blink: boolean }
  | { kind: 'walk'; frame: number; count: 6 | 8 }
  | { kind: 'jump-up' | 'jump-apex' | 'jump-fall' | 'land' | 'turn' }

function grid(w: number, h: number): Grid {
  return Array.from({ length: h }, () => Array<string | null>(w).fill(null))
}

function put(g: Grid, x: number, y: number, color: string) {
  if (y < 0 || x < 0 || y >= g.length || x >= g[0].length) return
  g[y][x] = color
}

function rect(g: Grid, x: number, y: number, w: number, h: number, color: string) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) put(g, xx, yy, color)
  }
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

function line(g: Grid, x0: number, y0: number, x1: number, y1: number, color: string) {
  let x = Math.round(x0)
  let y = Math.round(y0)
  const tx = Math.round(x1)
  const ty = Math.round(y1)
  const dx = Math.abs(tx - x)
  const dy = Math.abs(ty - y)
  const sx = x < tx ? 1 : -1
  const sy = y < ty ? 1 : -1
  let err = dx - dy
  for (let guard = 0; guard < 80; guard++) {
    put(g, x, y, color)
    if (x === tx && y === ty) break
    const e2 = 2 * err
    if (e2 > -dy) {
      err -= dy
      x += sx
    }
    if (e2 < dx) {
      err += dx
      y += sy
    }
  }
}

function shadeSecond(g: Grid) {
  for (const row of g) {
    let seen = 0
    for (let x = 0; x < row.length; x++) {
      if (row[x] !== 'f') continue
      seen += 1
      if (seen === 2) {
        row[x] = 's'
        break
      }
    }
  }
}

function outline(g: Grid) {
  const src = g.map((row) => row.slice())
  for (let y = 0; y < src.length; y++) {
    for (let x = 0; x < src[0].length; x++) {
      if (!src[y][x]) continue
      const edge = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => {
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || ny >= src.length || nx >= src[0].length) return true
        return !src[ny][nx]
      })
      if (edge) g[y][x] = 'o'
    }
  }
}

function finish(g: Grid) {
  shadeSecond(g)
  outline(g)
}

type FootDraw = { x: number; y: number; shoe: boolean }

function feet(pose: Pose): { left: FootDraw; right: FootDraw } {
  if (pose.kind === 'walk') {
    const cycle: WalkCycle = walkCycle(pose.count)
    const at = (foot: PlantFrame['foot']): FootDraw => {
      const plant = cycle.plants.find((entry) => entry.foot === foot && entry.frame === pose.frame)
      if (!plant) return { x: foot === 'left' ? 6 : 10, y: 19, shoe: false }
      return { x: 8 + plant.localX, y: 23, shoe: true }
    }
    return { left: at('left'), right: at('right') }
  }
  if (pose.kind === 'jump-up') return { left: { x: 6, y: 19, shoe: false }, right: { x: 10, y: 19, shoe: false } }
  if (pose.kind === 'jump-apex') return { left: { x: 7, y: 18, shoe: false }, right: { x: 11, y: 18, shoe: false } }
  if (pose.kind === 'jump-fall') return { left: { x: 6, y: 21, shoe: false }, right: { x: 11, y: 21, shoe: false } }
  if (pose.kind === 'land') return { left: { x: 4, y: 23, shoe: true }, right: { x: 12, y: 23, shoe: true } }
  if (pose.kind === 'turn') return { left: { x: 7, y: 23, shoe: true }, right: { x: 10, y: 23, shoe: true } }
  return { left: { x: 6, y: 23, shoe: true }, right: { x: 10, y: 23, shoe: true } }
}

function arms(pose: Pose): { back: [number, number]; front: [number, number] } {
  if (pose.kind === 'walk') {
    const swing = Math.round(Math.sin((pose.frame / pose.count) * Math.PI * 2) * 2)
    return { back: [5 - swing, 16], front: [11 + swing, 16] }
  }
  if (pose.kind === 'jump-up') return { back: [4, 11], front: [12, 11] }
  if (pose.kind === 'jump-apex') return { back: [3, 13], front: [12, 14] }
  if (pose.kind === 'jump-fall') return { back: [3, 12], front: [13, 12] }
  if (pose.kind === 'land') return { back: [2, 16], front: [13, 16] }
  if (pose.kind === 'turn') return { back: [3, 14], front: [5, 15] }
  return { back: [5, 17], front: [11, 17] }
}

function drawSkin(pose: Pose): Grid {
  const g = grid(SHEET_FRAME_W, SHEET_FRAME_H)
  const bob = pose.kind === 'idle' && pose.blink ? 1 : 0
  fillEllipse(g, 8.2, 7 + bob, 4.2, 4.3, 'f')
  rect(g, 7, 11, 2, 2, 'f')
  const leg = feet(pose)
  line(g, 7, 16, leg.left.x, Math.min(22, leg.left.y), 'f')
  line(g, 9, 16, leg.right.x, Math.min(22, leg.right.y), 'f')
  const arm = arms(pose)
  line(g, 6, 13, arm.back[0], arm.back[1], 'f')
  line(g, 6, 14, arm.back[0], arm.back[1] + 1, 'f')
  line(g, 10, 13, arm.front[0], arm.front[1], 'f')
  line(g, 10, 14, arm.front[0], arm.front[1] + 1, 'f')
  finish(g)
  if (!(pose.kind === 'idle' && pose.blink)) {
    put(g, 11, 6 + bob, 'e')
    put(g, 11, 7 + bob, 'e')
  }
  return g
}

function drawHair(pose: Pose, bobCut: boolean): Grid {
  const g = grid(SHEET_FRAME_W, SHEET_FRAME_H)
  const bob = pose.kind === 'idle' && pose.blink ? 1 : 0
  fillEllipse(g, 8.2, 5.2 + bob, 4.6, 3.1, 'f')
  for (let x = 5; x <= 12; x++) put(g, x, 4 + bob, 'f')
  if (bobCut) {
    for (let y = 5; y <= 11; y++) {
      put(g, 3, y + bob, 'f')
      put(g, 12, y + bob, 'f')
    }
    for (let y = 8; y <= 11; y++) {
      put(g, 4, y + bob, 'f')
      put(g, 11, y + bob, 'f')
    }
  }
  finish(g)
  return g
}

function drawOutfit(pose: Pose, coat: boolean): Grid {
  const g = grid(SHEET_FRAME_W, SHEET_FRAME_H)
  const leg = feet(pose)
  if (coat) {
    rect(g, 4, 12, 8, 7, 'f')
    rect(g, 6, 12, 4, 1, 's')
  } else {
    rect(g, 5, 12, 6, 5, 'f')
    put(g, 8, 14, 's')
  }
  for (const foot of [leg.left, leg.right]) {
    if (!foot.shoe) continue
    put(g, foot.x, 23, 'f')
    put(g, foot.x - 1, 23, 'f')
    put(g, foot.x, 22, 'f')
  }
  finish(g)
  for (const foot of [leg.left, leg.right]) {
    if (foot.shoe && !g[23][foot.x]) throw new Error(`shoe missing at ${foot.x} for ${pose.kind}`)
  }
  return g
}

const poses: Pose[] = [
  { kind: 'idle', blink: false },
  { kind: 'idle', blink: true },
  ...[0, 1, 2, 3, 4, 5].map((frame) => ({ kind: 'walk' as const, frame, count: 6 as const })),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((frame) => ({ kind: 'walk' as const, frame, count: 8 as const })),
  { kind: 'jump-up' },
  { kind: 'jump-apex' },
  { kind: 'jump-fall' },
  { kind: 'land' },
  { kind: 'turn' },
]

function sheetFor(partId: string): Grid[] {
  return poses.map((pose) => {
    if (partId === 'hair-short') return drawHair(pose, false)
    if (partId === 'hair-bob') return drawHair(pose, true)
    if (partId.startsWith('skin')) return drawSkin(pose)
    if (partId === 'outfit-coat') return drawOutfit(pose, true)
    return drawOutfit(pose, false)
  })
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

function paint(image: PNG, ox: number, oy: number, g: Grid, map: Record<string, string>) {
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      const key = g[y][x]
      if (!key) continue
      const color = map[key]
      if (!palette.has(color)) throw new Error(`off palette ${color}`)
      const [r, c, b] = hex(color)
      const i = ((oy + y) * image.width + (ox + x)) * 4
      image.data[i] = r
      image.data[i + 1] = c
      image.data[i + 2] = b
      image.data[i + 3] = 255
    }
  }
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

function heroSheets() {
  if (poses.length !== SHEET_FRAMES) throw new Error(`pose count ${poses.length}`)
  for (const part of HERO_PARTS) {
    const image = png(SHEET_FRAME_W * SHEET_FRAMES, SHEET_FRAME_H)
    const frames = sheetFor(part.id)
    frames.forEach((frame, index) => {
      paint(image, index * SHEET_FRAME_W, 0, frame, { f: part.fill, s: part.shade, o: OUTLINE, e: INK })
    })
    write(join(root, part.file), image)
  }
}

function groundTile() {
  const image = png(16, 16)
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const top = y < 3
      const speckle = (x + y) % 5 === 0
      const color = top ? (speckle ? '#4e5c48' : GRASS) : speckle ? '#a08468' : '#c9a36a'
      paintHex(image, x, y, y === 3 ? '#3a4a38' : color)
    }
  }
  write(join(root, 'tiles/ground.png'), image)
}

function thornTile() {
  const image = png(16, 10)
  const pixels: Array<[number, number]> = [
    [2, 8],
    [3, 7],
    [3, 8],
    [4, 5],
    [4, 6],
    [4, 7],
    [5, 8],
    [7, 8],
    [8, 6],
    [8, 7],
    [8, 8],
    [9, 4],
    [9, 5],
    [9, 6],
    [10, 7],
    [11, 8],
    [13, 8],
    [14, 6],
    [14, 7],
    [14, 8],
  ]
  for (const [x, y] of pixels) paintHex(image, x, y, y < 7 ? '#6b3030' : '#a84c3a')
  write(join(root, 'tiles/thorn.png'), image)
}

function platformTile() {
  const image = png(16, 8)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      const color = y === 0 || y === 7 ? '#6b3e26' : (x + y) % 4 === 0 ? '#a08468' : '#c9a36a'
      paintHex(image, x, y, color)
    }
  }
  write(join(root, 'tiles/platform.png'), image)
}

function pedestal() {
  const image = png(32, 20)
  for (let y = 6; y < 20; y++) {
    for (let x = 4; x < 28; x++) {
      const edge = y === 6 || y === 19 || x === 4 || x === 27
      paintHex(image, x, y, edge ? '#4a3a48' : (x + y) % 6 === 0 ? '#b8a090' : '#9aa0a4')
    }
  }
  for (let x = 8; x < 24; x++) paintHex(image, x, 5, '#4a3a48')
  write(join(root, 'tiles/pedestal.png'), image)
}

function giftBox() {
  const image = png(16, 16)
  for (let y = 3; y < 15; y++) {
    for (let x = 2; x < 14; x++) {
      const ribbon = x === 7 || x === 8 || y === 8
      const edge = x === 2 || x === 13 || y === 3 || y === 14
      const color = ribbon ? '#6b3030' : edge ? OUTLINE : '#d8c9b0'
      paintHex(image, x, y, color)
    }
  }
  paintHex(image, 6, 2, '#6b3030')
  paintHex(image, 9, 2, '#6b3030')
  paintHex(image, 7, 1, '#a84c3a')
  paintHex(image, 8, 1, '#a84c3a')
  write(join(root, 'tiles/gift-box.png'), image)
}

function icon(draw: (image: PNG) => void, name: string) {
  const image = png(16, 16)
  draw(image)
  write(join(root, `items/${name}.png`), image)
}

function items() {
  icon((image) => {
    for (let x = 2; x < 14; x++) {
      paintHex(image, x, 6, '#4a6580')
      paintHex(image, x, 7, '#2c3a48')
      paintHex(image, x, 10, '#4a6580')
    }
    for (let y = 6; y < 12; y++) {
      paintHex(image, 3, y, '#4a6580')
      paintHex(image, 12, y, '#2c3a48')
    }
  }, 'scarf')
  icon((image) => {
    rectHex(image, 4, 4, 8, 8, '#d8c9b0')
    rectHex(image, 5, 5, 6, 3, '#c5d4dc')
    rectHex(image, 11, 6, 3, 4, '#b8a090')
    rectHex(image, 4, 12, 8, 2, '#a08468')
  }, 'mug')
  icon((image) => {
    rectHex(image, 4, 2, 8, 12, '#6b3030')
    rectHex(image, 5, 3, 6, 10, '#d8c9b0')
    for (let y = 4; y < 12; y += 2) paintHex(image, 7, y, '#a08468')
  }, 'book')
  icon((image) => {
    for (const [x, y, color] of [
      [5, 4, '#a84c3a'],
      [8, 3, '#c9926a'],
      [11, 5, '#6b3030'],
      [7, 6, '#e8c4a0'],
      [10, 7, '#a84c3a'],
    ] as const) {
      rectHex(image, x, y, 2, 2, color)
    }
    for (let y = 8; y < 15; y++) paintHex(image, 8, y, '#3a4a38')
    paintHex(image, 7, 12, '#5a7a4a')
    paintHex(image, 9, 13, '#5a7a4a')
  }, 'bouquet')
  icon((image) => {
    for (let x = 4; x < 12; x++) paintHex(image, x, 2, '#c9a36a')
    paintHex(image, 8, 3, '#c9a36a')
    paintHex(image, 8, 4, '#c9a36a')
    const g = grid(16, 16)
    fillEllipse(g, 8, 9, 3.2, 3.6, '#c9a36a')
    fillEllipse(g, 8, 9, 1.6, 1.8, '#a84c3a')
    stamp(image, g)
  }, 'pendant')
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

function parallax() {
  const sky = png(180, 320)
  for (let y = 0; y < 320; y++) for (let x = 0; x < 180; x++) paintHex(sky, x, y, SKY)
  fillCloud(sky, 30, 28)
  fillCloud(sky, 110, 48)
  write(join(root, 'parallax/sky.png'), sky)

  const hills = png(180, 64)
  for (let x = 0; x < 180; x++) {
    const h = 28 + Math.round(10 * Math.sin((x / 180) * Math.PI * 2) + 4 * Math.sin((x / 180) * Math.PI * 4))
    for (let y = 64 - h; y < 64; y++) {
      paintHex(hills, x, y, y === 64 - h ? '#4e5c48' : HILL)
    }
  }
  write(join(root, 'parallax/hills.png'), hills)

  const grass = png(96, 32)
  for (let y = 16; y < 32; y++) for (let x = 0; x < 96; x++) paintHex(grass, x, y, y === 16 ? '#4e5c48' : GRASS)
  for (let x = 0; x < 96; x += 8) {
    paintHex(grass, x + 2, 14, '#3a4a38')
    paintHex(grass, x + 3, 12, GRASS)
    paintHex(grass, x + 3, 13, GRASS)
    paintHex(grass, x + 4, 14, '#4e5c48')
  }
  write(join(root, 'parallax/grass.png'), grass)
}

function fillCloud(image: PNG, cx: number, cy: number) {
  for (let y = cy - 4; y <= cy + 3; y++) {
    for (let x = cx - 10; x <= cx + 10; x++) {
      const dx = (x - cx) / 10
      const dy = (y - cy) / 4
      if (dx * dx + dy * dy <= 1) paintHex(image, x, y, '#c5d4dc')
    }
  }
}

function manifest() {
  const plants = (cycle: WalkCycle) =>
    cycle.plants.map((plant) => ({ frame: plant.frame, foot: plant.foot, localX: plant.localX }))
  const body = {
    frameW: SHEET_FRAME_W,
    frameH: SHEET_FRAME_H,
    frames: SHEET_FRAMES,
    anims: ANIM_INDEX,
    parts: HERO_PARTS.map((part) => ({ id: part.id, kind: part.kind, file: part.file, fill: part.fill, shade: part.shade })),
    walk: {
      6: { stride: 12, plants: plants(WALK_6) },
      8: { stride: 16, plants: plants(WALK_8) },
    },
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(body))
}

heroSheets()
groundTile()
thornTile()
platformTile()
pedestal()
giftBox()
items()
token()
frame()
photos()
parallax()
manifest()
console.log(`art written to ${root}`)
