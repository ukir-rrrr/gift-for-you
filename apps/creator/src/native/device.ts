import { bytesToBase64 } from '@gfy/imaging'
import * as Crypto from 'expo-crypto'
import * as SecureStore from 'expo-secure-store'

const KEY = 'gfy-device-key'

export function newDeviceKey(): string {
  return bytesToBase64(Crypto.getRandomBytes(32)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

let cached: Promise<string> | null = null

/** Anonymous key for this install (F2-11). Kept in the keychain / keystore; the server only sees its hash. */
export function deviceKey(): Promise<string> {
  cached ??= (async () => {
    const existing = await SecureStore.getItemAsync(KEY)
    if (existing) return existing
    const key = newDeviceKey()
    await SecureStore.setItemAsync(KEY, key, { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY })
    return key
  })()
  return cached
}
