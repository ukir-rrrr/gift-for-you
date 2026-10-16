import { tierByProduct } from '@gfy/schema'

export type PurchaseProof = { platform: string; transactionId: string; productId?: string }

/** A verified store transaction. appUserId is the RevenueCat app user the purchase belongs to. */
export type VerifiedPurchase = {
  ok: true
  transactionId: string
  productId: string
  appUserId: string
  store: string
  isSandbox: boolean
  purchasedAt: number
}

export type PurchaseResult = VerifiedPurchase | { ok: false; reason: string }

export interface PurchaseVerifier {
  /** Checks that `proof` is a real, unrefunded purchase made by `appUserId`. */
  verify(proof: PurchaseProof, appUserId: string): Promise<PurchaseResult>
}

/** Thrown when the store backend cannot answer; the app retries later with the same transaction. */
export class PurchaseUnavailable extends Error {}

/** The RevenueCat app user id for a device: the app sets the same value with Purchases.logIn. */
export function appUserIdFor(deviceId: string): string {
  return `gfy_${deviceId}`
}

/** Accepts sandbox transactions the creator's mock store hands out: platform "sandbox", id "sandbox-…". */
export class SandboxMockVerifier implements PurchaseVerifier {
  constructor(private readonly now: () => number = Date.now) {}

  async verify(proof: PurchaseProof, appUserId: string): Promise<PurchaseResult> {
    if (proof.platform !== 'sandbox') return { ok: false, reason: 'platform' }
    if (!/^sandbox-[A-Za-z0-9-]{8,64}$/.test(proof.transactionId)) return { ok: false, reason: 'receipt' }
    const productId = proof.productId ?? 'gfy_gift_standard'
    if (!tierByProduct(productId)) return { ok: false, reason: 'product' }
    return {
      ok: true,
      transactionId: `sandbox:${proof.transactionId}`,
      productId,
      appUserId,
      store: 'sandbox',
      isSandbox: true,
      purchasedAt: this.now(),
    }
  }
}

type Fetch = typeof fetch

type NonSubscription = {
  id?: string
  store_transaction_id?: string
  store?: string
  is_sandbox?: boolean
  purchase_date?: string
}

/**
 * F3-03: asks RevenueCat (REST v1, secret key) for the app user's consumable purchases and looks
 * for this transaction under the product it claims. RevenueCat has already validated the receipt
 * with Apple or Google; a refunded purchase drops out of non_subscriptions.
 */
export class RevenueCatVerifier implements PurchaseVerifier {
  constructor(
    private readonly secretKey: string,
    private readonly allowSandbox: boolean,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {
    if (!secretKey) throw new PurchaseUnavailable('REVENUECAT_SECRET_KEY is not set')
  }

  async verify(proof: PurchaseProof, appUserId: string): Promise<PurchaseResult> {
    if (proof.platform !== 'ios' && proof.platform !== 'android') return { ok: false, reason: 'platform' }
    const productId = proof.productId ?? ''
    if (!tierByProduct(productId)) return { ok: false, reason: 'product' }
    if (!/^[A-Za-z0-9._:-]{4,200}$/.test(proof.transactionId)) return { ok: false, reason: 'receipt' }
    let res: Response
    try {
      res = await this.fetchImpl(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
        headers: { authorization: `Bearer ${this.secretKey}`, accept: 'application/json' },
      })
    } catch {
      throw new PurchaseUnavailable('revenuecat unreachable')
    }
    if (res.status === 404) return { ok: false, reason: 'receipt' }
    if (!res.ok) throw new PurchaseUnavailable(`revenuecat ${res.status}`)
    const body = (await res.json().catch(() => null)) as { subscriber?: { non_subscriptions?: Record<string, NonSubscription[]> } } | null
    const list = body?.subscriber?.non_subscriptions?.[productId] ?? []
    const match = list.find((entry) => entry.store_transaction_id === proof.transactionId || entry.id === proof.transactionId)
    if (!match) return { ok: false, reason: 'receipt' }
    const isSandbox = Boolean(match.is_sandbox)
    if (isSandbox && !this.allowSandbox) return { ok: false, reason: 'sandbox' }
    return {
      ok: true,
      transactionId: match.store_transaction_id ?? proof.transactionId,
      productId,
      appUserId,
      store: match.store ?? proof.platform,
      isSandbox,
      purchasedAt: match.purchase_date ? Date.parse(match.purchase_date) || Date.now() : Date.now(),
    }
  }
}
