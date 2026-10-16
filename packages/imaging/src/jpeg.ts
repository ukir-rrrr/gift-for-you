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

/** A marker segment, or (marker -1) a run of entropy-coded scan data. */
type Segment = { marker: number; start: number; end: number }

const DATA = -1

/** Index of the next real marker after entropy-coded data starting at `from` (skips FF00 stuffing and RSTn). */
function scanEnd(bytes: Uint8Array, from: number): number {
  for (let at = from; at + 1 < bytes.length; at += 1) {
    if (bytes[at] !== 0xff) continue
    const next = bytes[at + 1]
    if (next === 0x00 || next === 0xff || (next >= 0xd0 && next <= 0xd7)) continue
    return at
  }
  throw new Error('truncated')
}

/**
 * Walks the whole file up to EOI: header segments, every scan of a progressive file, and any
 * segment between scans. Throws on a malformed or truncated file. `end` is just past EOI, so
 * anything appended after the image (where data can hide) is reported, never kept.
 */
function segments(bytes: Uint8Array): { list: Segment[]; end: number } {
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
      if (marker === SOI) throw new Error('bad marker')
      list.push({ marker, start: at, end: at + 2 })
      at += 2
      if (marker === EOI) return { list, end: at }
      continue
    }
    if (at + 4 > bytes.length) throw new Error('truncated')
    const length = (bytes[at + 2] << 8) | bytes[at + 3]
    if (length < 2) throw new Error('bad length')
    const end = at + 2 + length
    if (end > bytes.length) throw new Error('truncated')
    list.push({ marker, start: at, end })
    at = end
    if (marker === SOS) {
      const dataEnd = scanEnd(bytes, at)
      list.push({ marker: DATA, start: at, end: dataEnd })
      at = dataEnd
    }
  }
  throw new Error('truncated')
}

/**
 * Keeps only what a decoder needs: APP0 (JFIF), an ICC profile in APP2, and Adobe APP14.
 * Exif (with GPS), XMP, IPTC, maker notes and comments are dropped.
 */
function keepSegment(bytes: Uint8Array, segment: Segment): boolean {
  const { marker, start } = segment
  if (marker === DATA) return true
  const payload = start + 4
  if (marker === COM) return false
  if (marker === 0xe0) return ascii(bytes, payload, 'JFIF\0') || ascii(bytes, payload, 'JFXX\0')
  if (marker === 0xe2) return ascii(bytes, payload, 'ICC_PROFILE\0')
  if (marker === 0xee) return ascii(bytes, payload, 'Adobe')
  if (marker >= 0xe1 && marker <= 0xef) return false
  return true
}

export function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  const { list } = segments(bytes)
  const kept = list.filter((segment) => keepSegment(bytes, segment))
  const size = kept.reduce((sum, segment) => sum + (segment.end - segment.start), 0)
  // Rebuilt from kept pieces only; bytes after EOI are not copied.
  const out = new Uint8Array(2 + size)
  out.set([0xff, SOI])
  let at = 2
  for (const segment of kept) {
    out.set(bytes.subarray(segment.start, segment.end), at)
    at += segment.end - segment.start
  }
  return out
}

/** True when any segment that can carry Exif, GPS, XMP, IPTC or a comment is present, or data trails EOI. */
export function hasJpegMetadata(bytes: Uint8Array): boolean {
  const { list, end } = segments(bytes)
  return end < bytes.length || list.some((segment) => !keepSegment(bytes, segment))
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
