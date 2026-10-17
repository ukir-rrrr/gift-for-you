import * as Crypto from 'expo-crypto'
import type { TierId } from '@gfy/schema'
import { PRICE_TIERS } from '@gfy/schema'
import { fallbackProducts, type Store } from '../lib/purchases'
import { STORE_KIND } from './config'
import { revenueCatStore } from './revenuecat'

/** Sandbox stand-in for the store purchase. No money moves; the server's sandbox verifier accepts it. */
export const sandboxStore: Store = {
  label: 'Sandbox購入（テスト用・課金されません）',
  async purchase(_giftId: string, tier: TierId = 'standard') {
    const productId = PRICE_TIERS.find((entry) => entry.id === tier)?.productId ?? PRICE_TIERS[0].productId
    return { platform: 'sandbox', transactionId: `sandbox-${Crypto.randomUUID()}`, productId }
  },
  async products() {
    return fallbackProducts()
  },
}

/** EXPO_PUBLIC_STORE=revenuecat selects App Store / Google Play through RevenueCat (native builds only). */
export const appStore: Store = STORE_KIND === 'revenuecat' && revenueCatStore ? revenueCatStore : sandboxStore
