import * as Crypto from 'expo-crypto'
import type { Store } from '../lib/publish'

/** Sandbox stand-in for the store purchase. No money moves; the server's sandbox verifier accepts it. */
export const sandboxStore: Store = {
  label: 'Sandbox購入（テスト用・課金されません）',
  async purchase() {
    return { platform: 'sandbox', transactionId: `sandbox-${Crypto.randomUUID()}` }
  },
}
