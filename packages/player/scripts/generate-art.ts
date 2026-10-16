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
  WALKER_H,
  WALKER_W,
  POSE_FRAMES,
  WALK_6,
  WALK_8,
  stridePx,
  walkCycle,
  type FootPose,
  type HeroFrame,
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

function heroPose(pose: Pose): HeroFrame {
  if (pose.kind === 'walk') return walkCycle(pose.count).frames[pose.frame]
  if (pose.kind === 'idle') return { ...POSE_FRAMES.idle, bob: pose.blink ? 1 : 0 }
  return POSE_FRAMES[pose.kind]
}

function feet(pose: Pose): { left: FootDraw; right: FootDraw } {
  const frame = heroPose(pose)
  const plantY = SHEET_FRAME_H - 1
  const draw = (foot: FootPose): FootDraw => ({
    x: foot.x,
    y: foot.y,
    shoe: foot.y === plantY,
  })
  return { left: draw(frame.left), right: draw(frame.right) }
}

function arms(pose: Pose): { back: [number, number]; front: [number, number] } {
  const swing = heroPose(pose).arm
  if (swing > 0) return { back: [5, 16], front: [13, 14] }
  if (swing < 0) return { back: [3, 14], front: [11, 16] }
  if (pose.kind === 'jump-up') return { back: [4, 11], front: [12, 11] }
  if (pose.kind === 'jump-apex') return { back: [3, 13], front: [12, 14] }
  if (pose.kind === 'jump-fall') return { back: [3, 12], front: [13, 12] }
  if (pose.kind === 'land') return { back: [2, 16], front: [13, 16] }
  if (pose.kind === 'turn') return { back: [3, 14], front: [5, 15] }
  return { back: [5, 17], front: [11, 17] }
}

function drawSkin(pose: Pose): Grid {
  const g = grid(SHEET_FRAME_W, SHEET_FRAME_H)
  const bob = heroPose(pose).bob
  const hy = 6 + bob
  fillEllipse(g, 8, hy, 5.5, 5.4, 'f')
  put(g, 2, hy, 'f')
  put(g, 13, hy, 'f')
  rect(g, 7, 11 + bob, 2, 2, 'f')
  rect(g, 5, 12 + bob, 6, 3, 'f')
  const leg = feet(pose)
  line(g, 6, 16, leg.left.x, Math.min(22, leg.left.y), 'f')
  line(g, 7, 16, Math.max(0, leg.left.x), Math.min(22, leg.left.y), 'f')
  line(g, 9, 16, leg.right.x, Math.min(22, leg.right.y), 'f')
  line(g, 10, 16, Math.min(15, leg.right.x), Math.min(22, leg.right.y), 'f')
  const arm = arms(pose)
  line(g, 5, 13, arm.back[0], arm.back[1], 'f')
  line(g, 6, 13, arm.back[0], arm.back[1], 'f')
  line(g, 6, 14, arm.back[0], arm.back[1] + 1, 'f')
  line(g, 10, 13, arm.front[0], arm.front[1], 'f')
  line(g, 11, 13, Math.min(15, arm.front[0] + 1), arm.front[1], 'f')
  line(g, 10, 14, arm.front[0], arm.front[1] + 1, 'f')
  finish(g)
  if (!(pose.kind === 'idle' && pose.blink)) {
    put(g, 6, hy, 'e')
    put(g, 7, hy, 'e')
    put(g, 9, hy, 'e')
    put(g, 10, hy, 'e')
    put(g, 6, hy + 1, 'e')
    put(g, 10, hy + 1, 'e')
  }
  put(g, 5, hy + 2, 's')
  put(g, 11, hy + 2, 's')
  put(g, 8, hy + 3, 's')
  put(g, 8, hy + 4, 's')
  return g
}

function drawHair(pose: Pose, bobCut: boolean): Grid {
  const g = grid(SHEET_FRAME_W, SHEET_FRAME_H)
  const bob = heroPose(pose).bob
  fillEllipse(g, 8, 5 + bob, 5.8, 4.0, 'f')
  for (let x = 3; x <= 12; x++) put(g, x, 2 + bob, 'f')
  for (let x = 4; x <= 12; x++) put(g, x, 3 + bob, 'f')
  for (let x = 4; x <= 11; x++) put(g, x, 4 + bob, 'f')
  put(g, 5, 5 + bob, 'f')
  put(g, 7, 5 + bob, 'f')
  put(g, 8, 5 + bob, 'f')
  put(g, 10, 5 + bob, 'f')
  const sideEnd = bobCut ? 13 : 9
  for (let y = 5; y <= sideEnd; y++) {
    put(g, 2, y + bob, 'f')
    put(g, 3, y + bob, 'f')
    put(g, 12, y + bob, 'f')
    put(g, 13, y + bob, 'f')
  }
  if (bobCut) {
    for (let y = 8; y <= 13; y++) {
      put(g, 4, y + bob, 'f')
      put(g, 11, y + bob, 'f')
    }
    put(g, 5, 12 + bob, 'f')
    put(g, 10, 12 + bob, 'f')
  } else {
    put(g, 4, 6 + bob, 'f')
    put(g, 11, 6 + bob, 'f')
    put(g, 3, 10 + bob, 'f')
    put(g, 12, 10 + bob, 'f')
  }
  finish(g)
  return g
}

function drawOutfit(pose: Pose, coat: boolean): Grid {
  const g = grid(SHEET_FRAME_W, SHEET_FRAME_H)
  const bob = heroPose(pose).bob
  const top = 12 + bob
  const leg = feet(pose)
  if (coat) {
    rect(g, 3, top, 10, 8, 'f')
    rect(g, 4, top, 8, 1, 's')
    put(g, 6, top, 's')
    put(g, 9, top, 's')
    put(g, 3, top + 1, 's')
    put(g, 12, top + 1, 's')
    rect(g, 4, top + 7, 8, 2, 'f')
  } else {
    rect(g, 4, top, 8, 6, 'f')
    put(g, 6, top, 's')
    put(g, 7, top, 's')
    put(g, 8, top, 's')
    put(g, 9, top, 's')
    put(g, 4, top + 1, 's')
    put(g, 11, top + 1, 's')
    put(g, 7, top + 3, 's')
    put(g, 8, top + 3, 's')
  }
  const plantY = SHEET_FRAME_H - 1
  for (const foot of [leg.left, leg.right]) {
    if (!foot.shoe) continue
    put(g, foot.x, plantY, 'f')
    put(g, foot.x - 1, plantY, 'f')
    put(g, foot.x, plantY - 1, 'f')
    put(g, foot.x - 1, plantY - 1, 'f')
  }
  finish(g)
  for (const foot of [leg.left, leg.right]) {
    if (foot.shoe && !g[plantY][foot.x]) throw new Error(`shoe missing at ${foot.x} for ${pose.kind}`)
  }
  return g
}

function posesFromAnimIndex(): Pose[] {
  const poses: Array<Pose | undefined> = Array.from({ length: SHEET_FRAMES })
  const set = (index: number, pose: Pose) => {
    if (index < 0 || index >= SHEET_FRAMES) throw new Error(`frame ${index}`)
    if (poses[index]) throw new Error(`duplicate frame ${index}`)
    poses[index] = pose
  }
  for (const [i, frame] of ANIM_INDEX.idle.entries()) set(frame, { kind: 'idle', blink: i > 0 })
  for (const [i, frame] of ANIM_INDEX.walk6.entries()) set(frame, { kind: 'walk', frame: i, count: 6 })
  for (const [i, frame] of ANIM_INDEX.walk8.entries()) set(frame, { kind: 'walk', frame: i, count: 8 })
  set(ANIM_INDEX['jump-up'][0], { kind: 'jump-up' })
  set(ANIM_INDEX['jump-apex'][0], { kind: 'jump-apex' })
  set(ANIM_INDEX['jump-fall'][0], { kind: 'jump-fall' })
  set(ANIM_INDEX.land[0], { kind: 'land' })
  set(ANIM_INDEX.turn[0], { kind: 'turn' })
  if (poses.some((pose) => !pose)) throw new Error('ANIM_INDEX does not cover the sheet')
  return poses as Pose[]
}

const poses = posesFromAnimIndex()

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
  const image = png(16, 12)
  for (let x = 1; x < 15; x++) {
    paintHex(image, x, 11, '#3a4a38')
    if (x % 2 === 0) paintHex(image, x, 10, '#4e5c48')
  }
  const shards: Array<[number, number, number]> = [
    [2, 10, 5],
    [5, 10, 8],
    [8, 10, 9],
    [11, 10, 7],
    [14, 10, 4],
  ]
  for (const [x, base, h] of shards) {
    for (let y = base; y > base - h; y--) {
      const taper = Math.floor(((base - y) / h) * 2)
      paintHex(image, x, y, y === base - h + 1 ? OUTLINE : '#5c4638')
      if (taper === 0) paintHex(image, x - 1, y, '#3d3228')
    }
    paintHex(image, x, base - h, OUTLINE)
  }
  write(join(root, 'tiles/thorn.png'), image)
}

function platformTile() {
  const image = png(16, 8)
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 16; x++) {
      const edge = y === 0 || y === 7 || x === 0 || x === 15
      const grain = y === 2 || y === 5
      const color = edge ? OUTLINE : grain ? '#6b3e26' : (x + y) % 5 === 0 ? '#a08468' : '#c9a36a'
      paintHex(image, x, y, color)
    }
  }
  write(join(root, 'tiles/platform.png'), image)
}

function pedestal() {
  const image = png(36, 24)
  for (let y = 8; y < 24; y++) {
    const inset = y < 12 ? 2 : y < 18 ? 4 : 6
    for (let x = inset; x < 36 - inset; x++) {
      const edge = y === 8 || y === 23 || x === inset || x === 35 - inset
      paintHex(image, x, y, edge ? '#3d3228' : (x + y) % 7 === 0 ? '#b8a090' : '#9aa0a4')
    }
  }
  for (let x = 6; x < 30; x++) paintHex(image, x, 7, OUTLINE)
  rectHex(image, 7, 5, 22, 2, '#4a3a48')
  fillEllipseOn(image, 18, 4, 4.2, 3.2, '#c5d4dc')
  fillEllipseOn(image, 18, 4, 2.2, 1.6, '#8fadc0')
  paintHex(image, 18, 3, '#d8c9b0')
  paintHex(image, 17, 4, '#4a6580')
  paintHex(image, 18, 2, '#c5d4dc')
  write(join(root, 'tiles/pedestal.png'), image)
}

function walkerSheet() {
  const image = png(WALKER_W * 2, WALKER_H)
  const body = (ox: number, lift: number) => {
    fillEllipseOn(image, ox + 6, 4 + lift, 4.6, 3.6, '#5c4638')
    fillEllipseOn(image, ox + 6, 5 + lift, 2.4, 1.8, '#7a6248')
    paintHex(image, ox + 4, 3 + lift, '#1a1614')
    paintHex(image, ox + 7, 3 + lift, '#1a1614')
    paintHex(image, ox + 3, 2 + lift, '#3d3228')
    paintHex(image, ox + 8, 2 + lift, '#3d3228')
    paintHex(image, ox + 9, 4 + lift, '#3d3228')
    paintHex(image, ox + 2, 7, '#3d3228')
    paintHex(image, ox + 4, 9 - lift, '#3d3228')
    paintHex(image, ox + 7, 9 - lift, '#3d3228')
    paintHex(image, ox + 9, 7, '#3d3228')
    paintHex(image, ox + 10, 6 + lift, OUTLINE)
  }
  body(0, 0)
  body(WALKER_W, 1)
  write(join(root, 'tiles/walker.png'), image)
}

function fillEllipseOn(image: PNG, cx: number, cy: number, rx: number, ry: number, color: string) {
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const dx = (x + 0.5 - cx) / rx
      const dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) paintHex(image, x, y, color)
    }
  }
}

function cairn() {
  const image = png(12, 16)
  rectHex(image, 3, 12, 6, 4, '#7a6248')
  rectHex(image, 4, 8, 5, 4, '#a08468')
  rectHex(image, 5, 5, 3, 3, '#c9a36a')
  for (let x = 3; x < 9; x++) paintHex(image, x, 12, OUTLINE)
  paintHex(image, 6, 4, '#a84c3a')
  write(join(root, 'tiles/cairn.png'), image)
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

function giftBox() {
  const image = png(18, 18)
  for (let y = 5; y < 17; y++) {
    for (let x = 2; x < 16; x++) {
      const ribbon = x === 8 || x === 9 || y === 10
      const edge = x === 2 || x === 15 || y === 5 || y === 16
      const color = ribbon ? '#6b3030' : edge ? OUTLINE : '#d8c9b0'
      paintHex(image, x, y, color)
    }
  }
  paintHex(image, 7, 3, '#6b3030')
  paintHex(image, 10, 3, '#6b3030')
  paintHex(image, 8, 2, '#a84c3a')
  paintHex(image, 9, 2, '#a84c3a')
  paintHex(image, 8, 1, '#a84c3a')
  paintHex(image, 9, 1, '#a84c3a')
  write(join(root, 'tiles/gift-box.png'), image)
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
  for (let y = 0; y < 320; y++) {
    for (let x = 0; x < 180; x++) paintHex(sky, x, y, SKY)
  }
  fillEllipseOn(sky, 154, 22, 8, 8, '#d8c9b0')
  fillEllipseOn(sky, 154, 22, 5, 5, '#c5d4dc')
  fillCloud(sky, 26, 24)
  fillCloud(sky, 88, 38)
  fillCloud(sky, 148, 20)
  fillCloud(sky, 54, 58)
  fillCloud(sky, 120, 70)
  for (let x = 0; x < 180; x++) {
    const h = 22 + Math.round(8 * Math.sin((x / 180) * Math.PI * 2) + 5 * Math.sin((x / 90) * Math.PI))
    for (let y = 168 - h; y < 176; y++) {
      paintHex(sky, x, y, y === 168 - h ? '#2c3a48' : '#4a6580')
    }
  }
  write(join(root, 'parallax/sky.png'), sky)

  const hills = png(180, 80)
  for (let x = 0; x < 180; x++) {
    const back = 48 + Math.round(10 * Math.sin((x / 180) * Math.PI * 2 + 0.6))
    for (let y = 80 - back; y < 80; y++) paintHex(hills, x, y, '#4e5c48')
  }
  for (let x = 0; x < 180; x++) {
    const h = 34 + Math.round(12 * Math.sin((x / 180) * Math.PI * 2) + 6 * Math.sin((x / 180) * Math.PI * 4))
    for (let y = 80 - h; y < 80; y++) {
      paintHex(hills, x, y, y === 80 - h ? '#3a4a38' : HILL)
    }
  }
  tree(hills, 18, 50)
  tree(hills, 46, 44)
  tree(hills, 78, 40)
  tree(hills, 112, 48)
  tree(hills, 142, 42)
  tree(hills, 168, 46)
  write(join(root, 'parallax/hills.png'), hills)

  const grass = png(96, 48)
  for (let y = 22; y < 48; y++) {
    for (let x = 0; x < 96; x++) {
      const top = y === 22
      paintHex(grass, x, y, top ? '#4e5c48' : (x + y) % 9 === 0 ? '#4e5c48' : GRASS)
    }
  }
  for (let x = 0; x < 96; x += 6) {
    paintHex(grass, x + 1, 20, '#3a4a38')
    paintHex(grass, x + 2, 18, GRASS)
    paintHex(grass, x + 2, 19, GRASS)
    paintHex(grass, x + 3, 20, '#4e5c48')
    paintHex(grass, x + 4, 21, '#3a4a38')
  }
  paintHex(grass, 12, 28, '#7a6248')
  paintHex(grass, 40, 34, '#a08468')
  paintHex(grass, 71, 30, '#7a6248')
  paintHex(grass, 24, 24, '#6d7f6a')
  paintHex(grass, 58, 26, '#a84c3a')
  paintHex(grass, 59, 25, '#d8c9b0')
  paintHex(grass, 84, 32, '#c9a36a')
  write(join(root, 'parallax/grass.png'), grass)
}

function tree(image: PNG, x: number, y: number) {
  for (let t = 0; t < 8; t++) paintHex(image, x, y + t, '#5c3a28')
  fillEllipseOn(image, x, y - 2, 6, 5, '#3a4a38')
  fillEllipseOn(image, x - 1, y - 3, 4, 3.2, '#4e5c48')
}

function fillCloud(image: PNG, cx: number, cy: number) {
  fillEllipseOn(image, cx, cy, 12, 4.6, '#c5d4dc')
  fillEllipseOn(image, cx - 8, cy + 1, 7, 3.4, '#c5d4dc')
  fillEllipseOn(image, cx + 8, cy + 1, 7, 3.2, '#c5d4dc')
  fillEllipseOn(image, cx - 2, cy - 3, 5, 2.6, '#d8c9b0')
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
      6: { stride: stridePx(WALK_6), plants: plants(WALK_6) },
      8: { stride: stridePx(WALK_8), plants: plants(WALK_8) },
    },
  }
  writeFileSync(join(root, 'manifest.json'), JSON.stringify(body))
}

heroSheets()
groundTile()
thornTile()
platformTile()
pedestal()
walkerSheet()
cairn()
spark()
ray()
giftBox()
items()
token()
frame()
photos()
parallax()
manifest()
console.log(`art written to ${root}`)
