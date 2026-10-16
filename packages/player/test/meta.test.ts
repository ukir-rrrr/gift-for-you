import { PNG } from 'pngjs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ART_PALETTE, GIFT_ITEMS, PALETTE } from '@gfy/catalog'
import { UNAVAILABLE } from '../src/copy'
import { giftIdFromLocation, loadGift, readFlags } from '../src/route'
import { integerScale } from '../src/scale'

const assets = join(import.meta.dirname, '../public/assets')
const packDir = join(assets, 'gfy')
const allowed = new Set(PALETTE.map((hex) => hex.toLowerCase()))
const packAllowed = new Set(ART_PALETTE.map((hex) => hex.toLowerCase()))

function pngs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return pngs(path)
    return name.endsWith('.png') ? [path] : []
  })
}

function chunks(buf: Buffer): string[] {
  const names: string[] = []
  let offset = 8
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset)
    const name = buf.toString('ascii', offset + 4, offset + 8)
    names.push(name)
    offset += 12 + length
    if (name === 'IEND') break
  }
  return names
}

function expectPalette(files: string[], allowed: Set<string>) {
  for (const file of files) {
    const image = PNG.sync.read(readFileSync(file))
    const off = new Set<string>()
    const alphas = new Set<number>()
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3] === 0) continue
      alphas.add(image.data[i + 3])
      const hex = `#${[image.data[i], image.data[i + 1], image.data[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
      if (!allowed.has(hex)) off.add(hex)
    }
    expect([...off], file).toEqual([])
    expect([...alphas], file).toEqual([255])
  }
}

function frameBounds(image: PNG, ox: number, w: number) {
  let top = image.height
  let bottom = -1
  for (let y = 0; y < image.height; y++) {
    for (let x = ox; x < ox + w; x++) {
      if (image.data[(y * image.width + x) * 4 + 3] === 0) continue
      top = Math.min(top, y)
      bottom = Math.max(bottom, y)
    }
  }
  return { top, bottom }
}

describe('art', () => {
  it('keeps generated art on the 28-colour palette and the sprite pack on its 32', () => {
    const generated = pngs(assets).filter((file) => !file.startsWith(packDir))
    const pack = pngs(packDir)
    expect(generated.length).toBeGreaterThan(10)
    expect(pack).toHaveLength(11)
    expectPalette(generated, allowed)
    expectPalette(pack, packAllowed)
  })

  it('draws every catalog gift item and a generic link-preview image on the palette (F3-02, F3-08)', () => {
    expect(GIFT_ITEMS.length).toBeGreaterThanOrEqual(20)
    for (const item of GIFT_ITEMS) {
      const image = PNG.sync.read(readFileSync(join(assets, 'items', `${item.id}.png`)))
      expect([image.width, image.height], item.id).toEqual([24, 24])
    }
    const og = join(assets, '..', 'og.png')
    expectPalette([og], allowed)
    const image = PNG.sync.read(readFileSync(og))
    expect([image.width, image.height]).toEqual([1200, 630])
  })

  it('stands the hero 28px tall on the bottom row and strips photo metadata', () => {
    for (const [sheet, frames] of [['hero_walk', 8], ['hero_idle', 2]] as const) {
      const image = PNG.sync.read(readFileSync(join(packDir, `${sheet}.png`)))
      expect(image.width).toBe(24 * frames)
      expect(image.height).toBe(32)
      for (let frame = 0; frame < frames; frame++) {
        const { top, bottom } = frameBounds(image, frame * 24, 24)
        expect(bottom, `${sheet} ${frame}`).toBe(31)
        expect(bottom - top + 1, `${sheet} ${frame}`).toBe(28)
      }
    }
    for (const file of pngs(join(assets, 'photos'))) {
      const names = chunks(readFileSync(file))
      expect(names).not.toContain('eXIf')
      expect(names.some((name) => name.toLowerCase().includes('gps'))).toBe(false)
    }
  })
})

describe('gift routing', () => {
  it('uses one unavailable result for a missing id and an expired id', () => {
    const now = new Date('2026-10-16T00:00:00Z')
    expect(loadGift('missing-id', now).ok).toBe(false)
    expect(loadGift('expired', now).ok).toBe(false)
    expect(loadGift('demo', now).ok).toBe(true)
    expect(loadGift('demo', new Date('2027-06-01T00:00:00Z')).ok).toBe(true)
    expect(UNAVAILABLE).toBe('この冒険は見つかりませんでした。リンクをご確認ください。')
    expect(giftIdFromLocation({ pathname: '/g/%', hash: '' })).toBeNull()
    expect(giftIdFromLocation({ pathname: '/g/%E0%A4', hash: '' })).toBeNull()
    expect(giftIdFromLocation({ pathname: '/', hash: '#/g/%' })).toBeNull()
    expect(giftIdFromLocation({ pathname: '/g/demo', hash: '' })).toBe('demo')
  })
})

describe('flags', () => {
  it('reads a course template override and ignores anything else', () => {
    expect(readFlags('?template=course-02').template).toBe('course-02')
    expect(readFlags('?template=../x').template).toBeNull()
    expect(readFlags('').template).toBeNull()
  })

  it('ships generic link-preview tags without any gift data (F3-08)', () => {
    const html = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')
    expect(html).toContain('<meta property="og:image" content="/og.png" />')
    expect(html).toContain('og:title" content="小さな冒険のギフトが届いています"')
  })
})

describe('integer scale', () => {
  it('scales by whole pixels inside a phone viewport', () => {
    expect(integerScale(390, 844, 88)).toBe(2)
    expect(integerScale(180, 320, 0)).toBe(1)
  })
})
