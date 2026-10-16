import { bytesToBase64 } from '@gfy/imaging'

const KEY = 'gfy-device-key'

export function newDeviceKey(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cached: string | null = null

/** The web build has no keychain; the key lives in localStorage (or memory when storage is blocked). */
export async function deviceKey(): Promise<string> {
  if (cached) return cached
  try {
    cached = window.localStorage.getItem(KEY)
    if (!cached) {
      cached = newDeviceKey()
      window.localStorage.setItem(KEY, cached)
    }
  } catch {
    cached ??= newDeviceKey()
  }
  return cached
}
