/** Builds a minimal baseline JPEG header for tests. Not decodable pixels; enough for the segment walker. */
export function makeTestJpeg(options: { width?: number; height?: number; exif?: boolean; comment?: string; scan?: number[] } = {}): Uint8Array {
  const { width = 640, height = 480, exif = false, comment, scan = [0x12, 0x34, 0xff, 0x00, 0x56] } = options
  const bytes: number[] = [0xff, 0xd8]
  const segment = (marker: number, payload: number[]) => {
    const length = payload.length + 2
    bytes.push(0xff, marker, length >> 8, length & 0xff, ...payload)
  }
  const text = (value: string) => [...value].map((ch) => ch.charCodeAt(0))
  segment(0xe0, [...text('JFIF\0'), 1, 1, 0, 0, 1, 0, 1, 0, 0])
  if (exif) segment(0xe1, [...text('Exif\0\0'), ...text('MM\0*GPSLatitude=35.6812;GPSLongitude=139.7671')])
  if (comment) segment(0xfe, text(comment))
  segment(0xdb, [0, ...new Array(64).fill(1)])
  segment(0xc0, [8, height >> 8, height & 0xff, width >> 8, width & 0xff, 1, 1, 0x11, 0])
  segment(0xc4, [0, ...new Array(16).fill(0)])
  segment(0xda, [1, 1, 0, 0, 63, 0])
  bytes.push(...scan, 0xff, 0xd9)
  return new Uint8Array(bytes)
}
