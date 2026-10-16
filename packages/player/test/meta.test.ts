import { PNG } from 'pngjs'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PALETTE } from '@gfy/catalog'
import { UNAVAILABLE } from '../src/copy'
import { loadGift } from '../src/route'
import { integerScale } from '../src/scale'

const assets = join(import.meta.dirname, '../public/assets')
const allowed = new Set(PALETTE.map((hex) => hex.toLowerCase()))

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

describe('generated art', () => {
  it('uses only the 28 palette colors', () => {
    const files = pngs(assets)
    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      const image = PNG.sync.read(readFileSync(file))
      for (let i = 0; i < image.data.length; i += 4) {
        if (image.data[i + 3] === 0) continue
        const hex = `#${[image.data[i], image.data[i + 1], image.data[i + 2]].map((n) => n.toString(16).padStart(2, '0')).join('')}`
        expect(allowed.has(hex), `${file} ${hex}`).toBe(true)
        expect(image.data[i + 3]).toBe(255)
      }
    }
  })

  it('plants the outfit shoe on the bottom row and strips photo metadata', () => {
    const manifest = JSON.parse(readFileSync(join(assets, 'manifest.json'), 'utf8')) as {
      anims: { walk6: number[]; walk8: number[] }
      walk: { 6: { plants: { frame: number; localX: number }[] }; 8: { plants: { frame: number; localX: number }[] } }
    }
    const outfit = PNG.sync.read(readFileSync(join(assets, 'hero/outfit-shirt.png')))
    for (const count of [6, 8] as const) {
      const anim = count === 6 ? manifest.anims.walk6 : manifest.anims.walk8
      for (const plant of manifest.walk[count].plants) {
        const x = anim[plant.frame] * 16 + 8 + plant.localX
        const alpha = outfit.data[(23 * outfit.width + x) * 4 + 3]
        expect(alpha).toBe(255)
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
    expect(UNAVAILABLE).toBe('この冒険は見つかりませんでした。リンクをご確認ください。')
  })
})

describe('integer scale', () => {
  it('scales by whole pixels inside a phone viewport', () => {
    expect(integerScale(390, 844, 88)).toBe(2)
    expect(integerScale(180, 320, 0)).toBe(1)
  })
})
