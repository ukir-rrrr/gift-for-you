const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'
// Crockford base32 without I, L, O, U so codes survive being read aloud or typed.
const CODE32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function pick(alphabet: string, length: number): string {
  // Rejection sampling keeps every symbol equally likely.
  const limit = 256 - (256 % alphabet.length)
  let out = ''
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2))
    for (const byte of bytes) {
      if (byte < limit && out.length < length) out += alphabet[byte % alphabet.length]
    }
  }
  return out
}

/** 10 base62 chars, about 59 bits. Short enough for a QR code, too many to guess. */
export function newShareId(): string {
  return pick(BASE62, 10)
}

export function newGiftId(): string {
  return `g_${pick(BASE62, 22)}`
}

/** 12 symbols (60 bits) shown as XXXX-XXXX-XXXX. */
export function newRevokeCode(): string {
  const raw = pick(CODE32, 12)
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`
}

export function normalizeRevokeCode(input: string): string {
  return input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

export function toHex(bytes: ArrayBuffer | Uint8Array): string {
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256Hex(text: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Workers cap PBKDF2 at 100k iterations.
const PBKDF2_ITERATIONS = 100_000

async function pbkdf2(secret: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256)
  return toHex(bits)
}

export async function hashPassphrase(passphrase: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${await pbkdf2(passphrase, salt, PBKDF2_ITERATIONS)}`
}

export async function verifyPassphrase(passphrase: string, stored: string): Promise<boolean> {
  const [scheme, rounds, saltHex, hash] = stored.split('$')
  if (scheme !== 'pbkdf2' || !saltHex || !hash) return false
  const salt = new Uint8Array(saltHex.match(/../g)!.map((h) => parseInt(h, 16)))
  return timingSafeEqual(await pbkdf2(passphrase, salt, Number(rounds)), hash)
}

/** Device keys are 32 random bytes, base64url. Only their hash is stored. */
export function validDeviceKey(key: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(key)
}
