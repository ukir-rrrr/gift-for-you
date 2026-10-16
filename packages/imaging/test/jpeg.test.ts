import { describe, expect, it } from 'vitest'
import {
  base64ToBytes,
  bytesToBase64,
  fitWithin,
  hasJpegMetadata,
  jpegDataUrl,
  jpegFromDataUrl,
  readJpegInfo,
  stripJpegMetadata,
} from '../src/index'
import { makeTestJpeg } from '../src/testing'

const decode = (bytes: Uint8Array) => new TextDecoder('latin1').decode(bytes)

describe('stripJpegMetadata', () => {
  it('drops Exif with GPS and comments but keeps the frame and scan', () => {
    const input = makeTestJpeg({ exif: true, comment: 'taken at home', width: 1080, height: 720 })
    expect(hasJpegMetadata(input)).toBe(true)
    expect(decode(input)).toContain('GPSLatitude')
    const out = stripJpegMetadata(input)
    expect(hasJpegMetadata(out)).toBe(false)
    expect(decode(out)).not.toContain('GPS')
    expect(decode(out)).not.toContain('taken at home')
    expect(decode(out)).toContain('JFIF')
    expect(readJpegInfo(out)).toEqual({ width: 1080, height: 720 })
    expect([...out.slice(-10)]).toEqual([0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x01, 0xff, 0xd9])
  })

  it('drops data appended after EOI', () => {
    const input = makeTestJpeg({ trailing: 'GPSLatitude=35.6812' })
    expect(hasJpegMetadata(input)).toBe(true)
    const out = stripJpegMetadata(input)
    expect(decode(out)).not.toContain('GPS')
    expect([...out.slice(-2)]).toEqual([0xff, 0xd9])
    expect(hasJpegMetadata(out)).toBe(false)
  })

  it('walks every scan and drops comments between them', () => {
    const input = makeTestJpeg({ secondScanComment: 'GPS between scans' })
    expect(hasJpegMetadata(input)).toBe(true)
    const out = stripJpegMetadata(input)
    expect(decode(out)).not.toContain('GPS')
    expect([...out.slice(-4)]).toEqual([0x77, 0x88, 0xff, 0xd9])
  })

  it('leaves a clean file byte for byte', () => {
    const input = makeTestJpeg()
    expect(stripJpegMetadata(input)).toEqual(input)
  })

  it('rejects files that are not jpeg or are truncated', () => {
    expect(() => stripJpegMetadata(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]))).toThrow()
    expect(() => stripJpegMetadata(makeTestJpeg().subarray(0, 30))).toThrow()
    // Missing EOI.
    const whole = makeTestJpeg()
    expect(() => stripJpegMetadata(whole.subarray(0, whole.length - 2))).toThrow()
  })
})

describe('fitWithin', () => {
  it('fits the long edge inside 1080 without upscaling', () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 1080, height: 810 })
    expect(fitWithin(3024, 4032)).toEqual({ width: 810, height: 1080 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('base64', () => {
  it('round trips and only accepts jpeg data urls', () => {
    const bytes = makeTestJpeg({ exif: true })
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
    expect(bytesToBase64(new Uint8Array([1, 2]))).toBe(Buffer.from([1, 2]).toString('base64'))
    expect(jpegFromDataUrl(jpegDataUrl(bytes))).toEqual(bytes)
    expect(jpegFromDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull()
  })
})
