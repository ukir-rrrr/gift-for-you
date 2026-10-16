/** Long edge every uploaded photo is fitted inside. */
export const MAX_EDGE = 1080

export type JpegInfo = { width: number; height: number }

const SOI = 0xd8
const EOI = 0xd9
const SOS = 0xda
const COM = 0xfe

function ascii(bytes: Uint8Array, start: number, text: string): boolean {
  if (start + text.length > bytes.length) return false
  for (let i = 0; i < text.length; i += 1) if (bytes[start + i] !== text.charCodeAt(i)) return false
  return true
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0xff && bytes[1] === SOI && bytes[2] === 0xff
}

/** Markers with no length field. */
function standalone(marker: number): boolean {
  return marker === SOI || marker === EOI || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)
}

type Segment = { marker: number; start: number; end: number }

/** Walks header segments up to and including SOS. Throws on a truncated or malformed header. */
function segments(bytes: Uint8Array): { list: Segment[]; scan: number } {
  if (!isJpeg(bytes)) throw new Error('not a jpeg')
  const list: Segment[] = []
  let at = 2
  while (at < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error('bad marker')
    // Fill bytes before a marker are legal.
    while (bytes[at + 1] === 0xff) at += 1
    const marker = bytes[at + 1]
    if (marker === undefined) throw new Error('truncated')
    if (standalone(marker)) {
      list.push({ marker, start: at, end: at + 2 })
      at += 2
      if (marker === EOI) return { list, scan: at }
      continue
    }
    if (at + 4 > bytes.length) throw new Error('truncated')
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    if (length < 2) throw new Error('bad length')
    const end = at + 2 + length
    if (end > bytes.length) throw new Error('truncated')
    list.push({ marker, start: at, end })
    at = end
    if (marker === SOS) return { list, scan: at }
  }
  throw new Error('no scan')
}

/**
 * Keeps only what a decoder needs: APP0 (JFIF), an ICC profile in APP2, and Adobe APP14.
 * Exif (with GPS), XMP, IPTC, maker notes and comments are dropped.
 */
function keepSegment(bytes: Uint8Array, segment: Segment): boolean {
  const { marker, start } = segment
  const payload = start + 4
  if (marker === COM) return false
  if (marker === 0xe0) return ascii(bytes, payload, 'JFIF\0') || ascii(bytes, payload, 'JFXX\0')
  if (marker === 0xe2) return ascii(bytes, payload, 'ICC_PROFILE\0')
  if (marker === 0xee) return ascii(bytes, payload, 'Adobe')
  if (marker >= 0xe1 && marker <= 0xef) return false
  return true
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const { list, scan } = segments(bytes)
  const kept = list.filter((segment) => keepSegment(bytes, segment))
  const headerSize = kept.reduce((sum, segment) => sum + (segment.end - segment.start), 0)
  const out = new Uint8Array(2 + headerSize + (bytes.length - scan))
  out.set([0xff, SOI])
  let at = 2
  for (const segment of kept) {
    out.set(bytes.subarray(segment.start, segment.end), at)
    at += segment.end - segment.start
  }
  out.set(bytes.subarray(scan), at)
  return out
}

/** True when any segment that can carry Exif, GPS, XMP, IPTC or a comment is present. */
export function hasJpegMetadata(bytes: Uint8Array): boolean {
  const { list } = segments(bytes)
  return list.some((segment) => !keepSegment(bytes, segment))
}

export function readJpegInfo(bytes: Uint8Array): JpegInfo {
  const { list } = segments(bytes)
  // SOF0..SOF15 except DHT (C4), JPG (C8) and DAC (CC).
  const frame = list.find(
    (segment) => segment.marker >= 0xc0 && segment.marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(segment.marker),
  )
  if (!frame || frame.end - frame.start < 9) throw new Error('no frame header')
  const height = (bytes[frame.start + 5] << 8) | bytes[frame.start + 6]
  const width = (bytes[frame.start + 7] << 8) | bytes[frame.start + 8]
  if (width === 0 || height === 0) throw new Error('empty frame')
  return { width, height }
}

/** Size that fits inside `max` on the long edge without upscaling. */
export function fitWithin(width: number, height: number, max = MAX_EDGE): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max) return { width, height }
  const scale = max / long
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}
