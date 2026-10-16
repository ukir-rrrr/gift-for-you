import type { TierId } from '@gfy/schema'
import { ApiError, type Api, type PhotoVerdict, type Published } from './api'
import { dropPending, savePending, type Store } from './purchases'
import type { KV } from './storage'
import type { Draft } from './draft'
import { cleanJpeg } from './photo'
import type { GiftContent } from './share'

export type PublishStage = 'upload' | 'moderation' | 'preview' | 'purchase' | 'issue' | 'done'

export const PUBLISH_STAGES: readonly { id: PublishStage; label: string }[] = [
  { id: 'upload', label: 'アップロード' },
  { id: 'moderation', label: 'チェック' },
  { id: 'preview', label: 'プレビュー' },
  { id: 'purchase', label: '購入' },
  { id: 'issue', label: 'リンク発行' },
  { id: 'done', label: '共有' },
]

export type { PurchaseProof, Store } from './purchases'

export type FlowDeps = {
  api: Api
  readPhoto(ref: string): Promise<Uint8Array | null>
  /** Remembers the server draft so a retry reuses its uploads. */
  rememberGift(giftId: string | null): void
}

export type ModerationResult =
  | { ok: true; giftId: string; verdicts: PhotoVerdict[] }
  | { ok: false; giftId: string | null; rejected: string[]; error?: unknown }

async function uploadAll(giftId: string, draft: Draft, deps: FlowDeps, onPhoto: (done: number, total: number) => void) {
  const verdicts: PhotoVerdict[] = []
  let done = 0
  for (const coin of draft.coins) {
    const stored = await deps.readPhoto(coin.photoRef)
    if (!stored) throw new ApiError(0, 'photo_missing_local', { refs: [coin.photoRef] })
    verdicts.push(await deps.api.uploadPhoto(giftId, coin.photoRef, cleanJpeg(stored).bytes))
    done += 1
    onPhoto(done, draft.coins.length)
  }
  return verdicts
}

/** Uploads every coin photo and the text, letting the server moderate both. Nothing is public yet. */
export async function uploadAndModerate(
  draft: Draft,
  content: GiftContent,
  deps: FlowDeps,
  onStage: (stage: PublishStage, detail?: string) => void = () => {},
): Promise<ModerationResult> {
  let giftId = draft.serverGiftId
  try {
    onStage('upload')
    if (!giftId) {
      giftId = (await deps.api.createGift()).giftId
      deps.rememberGift(giftId)
    }
    let verdicts: PhotoVerdict[]
    const progress = (done: number, total: number) => onStage('upload', `${done}/${total}`)
    try {
      verdicts = await uploadAll(giftId, draft, deps, progress)
    } catch (error) {
      // The server sweeps drafts after two days; start a fresh one once.
      if (!(error instanceof ApiError) || (error.status !== 404 && error.code !== 'not_draft')) throw error
      giftId = (await deps.api.createGift()).giftId
      deps.rememberGift(giftId)
      verdicts = await uploadAll(giftId, draft, deps, progress)
    }
    onStage('moderation')
    const rejected = verdicts.filter((verdict) => verdict.status === 'rejected').map((verdict) => verdict.ref)
    if (rejected.length > 0) return { ok: false, giftId, rejected }
    await deps.api.putContent(giftId, content)
    return { ok: true, giftId, verdicts }
  } catch (error) {
    const rejected = error instanceof ApiError && error.code === 'photo_rejected' ? error.refs : []
    return { ok: false, giftId, rejected, error }
  }
}

export type BuyOptions = {
  tier?: TierId
  /** Spend a verified purchase that no gift used yet instead of buying again. */
  credit?: string
  /** Where a paid transaction waits until the server has taken it (F3-03). */
  kv?: KV
}

export async function purchaseAndPublish(
  giftId: string,
  store: Store,
  api: Api,
  onStage: (stage: PublishStage) => void = () => {},
  options: BuyOptions = {},
): Promise<Published> {
  onStage('purchase')
  if (options.credit) {
    await api.purchase(giftId, { platform: 'credit', transactionId: options.credit })
  } else {
    const proof = await store.purchase(giftId, options.tier)
    // Paid from here on: keep the proof until the server has it, so a crash cannot lose it.
    if (options.kv) await savePending(options.kv, { giftId, proof, at: Date.now() })
    await api.purchase(giftId, proof)
    if (options.kv) await dropPending(options.kv, proof.transactionId)
  }
  onStage('issue')
  const published = await api.publish(giftId)
  onStage('done')
  return published
}
