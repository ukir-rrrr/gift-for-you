const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function bytesToBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = bytes[i + 1]
    const c = bytes[i + 2]
    out += ALPHABET[a >> 2]
    out += ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]
    out += b === undefined ? '=' : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]
    out += c === undefined ? '=' : ALPHABET[c & 63]
  }
  return out
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let at = 0
  for (let i = 0; i < clean.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (i + k < clean.length ? ALPHABET.indexOf(clean[i + k]) : -1))
    out[at++] = (n[0] << 2) | (n[1] >> 4)
    if (n[2] >= 0) out[at++] = ((n[1] & 15) << 4) | (n[2] >> 2)
    if (n[3] >= 0) out[at++] = ((n[2] & 3) << 6) | n[3]
  }
  return out.subarray(0, at)
}

const DATA_URL = /^data:(image\/jpeg);base64,([A-Za-z0-9+/=\s]+)$/

/** Accepts only base64 JPEG data URLs. */
export function jpegFromDataUrl(url: string): Uint8Array | null {
  const match = url.match(DATA_URL)
  return match ? base64ToBytes(match[2]) : null
}

export function jpegDataUrl(bytes: Uint8Array): string {
  return `data:image/jpeg;base64,${bytesToBase64(bytes)}`
}
