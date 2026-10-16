import { PRICE_TIERS, type TierId } from '@gfy/schema'
import * as Crypto from 'expo-crypto'
import { Platform } from 'react-native'
import Purchases, { PRODUCT_CATEGORY, type PurchasesStoreProduct } from 'react-native-purchases'
import { PurchaseCancelled, fallbackProducts, type PurchaseProof, type Store, type StoreProduct } from '../lib/purchases'
import { REVENUECAT_KEYS } from './config'
import { deviceKey } from './device'

let ready: Promise<void> | null = null

/**
 * The RevenueCat app user is "gfy_" + SHA-256 of the device key: the same value the server derives
 * from the Device header, so it can check that a transaction belongs to this device.
 */
async function appUserId(): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, await deviceKey())
  return `gfy_${digest.toLowerCase()}`
}

function configure(): Promise<void> {
  ready ??= (async () => {
    const apiKey = Platform.OS === 'ios' ? REVENUECAT_KEYS.ios : REVENUECAT_KEYS.android
    if (!apiKey) throw new Error('RevenueCat public SDK key is not set for this platform')
    Purchases.configure({ apiKey, appUserID: await appUserId() })
  })()
  return ready
}

async function storeProducts(): Promise<PurchasesStoreProduct[]> {
  await configure()
  return Purchases.getProducts(
    PRICE_TIERS.map((tier) => tier.productId),
    PRODUCT_CATEGORY.NON_SUBSCRIPTION,
  )
}

/** F3-03: consumable in-app purchases through RevenueCat. The server verifies every transaction. */
export const revenueCatStore: Store | null = {
  label: Platform.OS === 'ios' ? 'App Storeで購入' : 'Google Playで購入',
  async products(): Promise<StoreProduct[]> {
    try {
      const found = await storeProducts()
      return fallbackProducts().map((fallback) => {
        const product = found.find((entry) => entry.identifier === fallback.productId)
        return product ? { ...fallback, price: product.priceString } : fallback
      })
    } catch {
      return fallbackProducts()
    }
  },
  async purchase(_giftId: string, tier: TierId = 'standard'): Promise<PurchaseProof> {
    const productId = PRICE_TIERS.find((entry) => entry.id === tier)?.productId ?? PRICE_TIERS[0].productId
    const product = (await storeProducts()).find((entry) => entry.identifier === productId)
    if (!product) throw new Error(`product ${productId} is not available`)
    try {
      const result = await Purchases.purchaseStoreProduct(product)
      return { platform: Platform.OS, transactionId: result.transaction.transactionIdentifier, productId: result.productIdentifier }
    } catch (error) {
      if ((error as { userCancelled?: boolean | null }).userCancelled) throw new PurchaseCancelled('cancelled')
      throw error
    }
  },
  async transactions(): Promise<PurchaseProof[]> {
    await configure()
    const info = await Purchases.getCustomerInfo()
    return info.nonSubscriptionTransactions.map((tx) => ({ platform: Platform.OS, transactionId: tx.transactionIdentifier, productId: tx.productIdentifier }))
  },
  async reset(): Promise<void> {
    if (!ready) return
    await Purchases.logOut().catch(() => undefined)
    ready = null
  },
}
