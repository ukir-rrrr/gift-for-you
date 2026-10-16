export type PurchaseProof = { platform: string; transactionId: string }

export type PurchaseResult = { ok: true; transactionId: string } | { ok: false; reason: string }

/**
 * Production verifies a store receipt (App Store / Google Play, likely through RevenueCat).
 * Needs store accounts and keys, so only the sandbox mock lives here.
 */
export interface PurchaseVerifier {
  verify(proof: PurchaseProof): Promise<PurchaseResult>
}

/** Accepts sandbox transactions the creator's mock store hands out: platform "sandbox", id "sandbox-…". */
export class SandboxMockVerifier implements PurchaseVerifier {
  async verify(proof: PurchaseProof): Promise<PurchaseResult> {
    if (proof.platform !== 'sandbox') return { ok: false, reason: 'platform' }
    if (!/^sandbox-[A-Za-z0-9-]{8,64}$/.test(proof.transactionId)) return { ok: false, reason: 'receipt' }
    return { ok: true, transactionId: `sandbox:${proof.transactionId}` }
  }
}
