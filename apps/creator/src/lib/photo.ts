import { MAX_EDGE, fitWithin, hasJpegMetadata, readJpegInfo, stripJpegMetadata } from '@gfy/imaging'

export { fitWithin, MAX_EDGE }

/**
 * Last check before a photo leaves the device or is stored: drop any Exif/GPS left by the encoder and
 * make sure the long edge is inside 1080px. Throws when the bytes are not a usable JPEG.
 */
export function cleanJpeg(bytes: Uint8Array): { bytes: Uint8Array; width: number; height: number } {
  const clean = hasJpegMetadata(bytes) ? stripJpegMetadata(bytes) : bytes
  const { width, height } = readJpegInfo(clean)
  if (Math.max(width, height) > MAX_EDGE) throw new Error('photo larger than 1080px')
  return { bytes: clean, width, height }
}

/** Resize target for the encoder, or null when the picked image already fits. */
export function resizeTarget(width: number, height: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= MAX_EDGE) return null
  const fit = fitWithin(width, height)
  // Give only the long edge so the encoder keeps the aspect ratio itself.
  return width >= height ? { width: fit.width } : { height: fit.height }
}
