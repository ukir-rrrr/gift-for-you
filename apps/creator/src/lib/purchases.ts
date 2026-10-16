import { PRICE_TIERS, type TierId } from '@gfy/schema'
import { ApiError, type Api, type Credit } from './api'
import type { KV } from './storage'

/** What the store hands back after a purchase; the server verifies it (F3-03). */
export type PurchaseProof = { platform: string; transactionId: string; productId?: string }

export type StoreProduct = { tier: TierId; productId: string; price: string }

/** The buyer closed the store sheet. Not an error to show. */
export class PurchaseCancelled extends Error {}

/** App Store / Google Play through RevenueCat, or the sandbox stand-in on web and in e2e. */
export interface Store {
  readonly label: string
  purchase(giftId: string, tier?: TierId): Promise<PurchaseProof>
  /** Localised prices from the store. Missing: the fixed yen prices in PRICE_TIERS. */
  products?(): Promise<StoreProduct[]>
  /** Consumable transactions the store knows for this user, finished or not. */
  transactions?(): Promise<PurchaseProof[]>
  /** Forgets the store user (account deletion). */
  reset?(): Promise<void>
}

export function fallbackProducts(): StoreProduct[] {
  return PRICE_TIERS.map((tier) => ({ tier: tier.id, productId: tier.productId, price: `¥${tier.priceJpy}` }))
}

const PENDING_KEY = 'gfy:pending-purchases:v1'
const SYNCED_KEY = 'gfy:synced-transactions:v1'

/** A paid transaction the server has not taken yet, kept until it has. */
export type PendingPurchase = { giftId: string; proof: PurchaseProof; at: number }

async function readList<T>(kv: KV, key: string): Promise<T[]> {
  try {
    const raw = await kv.getItem(key)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

export async function loadPending(kv: KV): Promise<PendingPurchase[]> {
  return readList<PendingPurchase>(kv, PENDING_KEY)
}

export async function savePending(kv: KV, entry: PendingPurchase): Promise<void> {
  const list = (await loadPending(kv)).filter((item) => item.proof.transactionId !== entry.proof.transactionId)
  await kv.setItem(PENDING_KEY, JSON.stringify([...list, entry]))
}

export async function dropPending(kv: KV, transactionId: string): Promise<void> {
  const list = (await loadPending(kv)).filter((item) => item.proof.transactionId !== transactionId)
  if (list.length === 0) await kv.removeItem(PENDING_KEY)
  else await kv.setItem(PENDING_KEY, JSON.stringify(list))
}


/** Verification refusals that will not change: anything else (e.g. "receipt") may be RevenueCat lagging. */
const PERMANENT_REFUSALS = new Set(['refunded', 'product', 'platform', 'sandbox', 'format'])

/** How long a "receipt" refusal (not listed by RevenueCat) is retried before it counts as final. */
export const RECEIPT_RETRY_MS = 7 * 24 * 3600_000

/** Offline, rate limited, server trouble, or a refusal that may pass later: keep the record and try again. */
export function retryable(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true
  if (error.status === 0 || error.status === 429 || error.status >= 500) return true
  if (error.code === 'purchase_invalid') return !PERMANENT_REFUSALS.has(String(error.detail.reason ?? ''))
  return false
}

/**
 * F3-03: consumables cannot be restored, so a payment the server never saw is replayed instead:
 * first every pending record (paid, then the app died or went offline), then every store
 * transaction this device has not synced yet. Each becomes a credit or lands on its gift.
 * Offline or server trouble leaves the record for the next start.
 */
export async function settlePurchases(api: Api, kv: KV, store?: Store, now = Date.now()): Promise<Credit[]> {
  for (const entry of await loadPending(kv)) {
    try {
      await api.purchase(entry.giftId, entry.proof)
      await dropPending(kv, entry.proof.transactionId)
    } catch (error) {
      // A transaction RevenueCat still does not list after a week (refunded, never completed) is final.
      const stale = error instanceof ApiError && error.detail.reason === 'receipt' && now - entry.at > RECEIPT_RETRY_MS
      if (retryable(error) && !stale) continue
      // A final answer for this gift (taken by another purchase, published, draft gone, or refused for
      // good). Hand a still-valid payment over as a credit; keep the record unless that also settles.
      try {
        await api.syncPurchase(entry.proof)
      } catch (syncError) {
        // Past the week, the same "receipt" refusal from the hand-over is final too; outages still wait.
        const refusedForGood = stale && syncError instanceof ApiError && syncError.code === 'purchase_invalid'
        if (retryable(syncError) && !refusedForGood) continue
      }
      await dropPending(kv, entry.proof.transactionId)
    }
  }
  if (store?.transactions) {
    const synced = new Set(await readList<string>(kv, SYNCED_KEY))
    try {
      for (const proof of await store.transactions()) {
        if (synced.has(proof.transactionId)) continue
        try {
          await api.syncPurchase(proof)
          synced.add(proof.transactionId)
        } catch (error) {
          // Refused for good (another user's, refunded, wrong product): not retried on every start.
          if (!retryable(error)) synced.add(proof.transactionId)
        }
      }
    } catch {
      // The store could not answer; try again next time.
    }
    await kv.setItem(SYNCED_KEY, JSON.stringify([...synced].slice(-200)))
  }
  try {
    return await api.unclaimedPurchases()
  } catch {
    return []
  }
}
