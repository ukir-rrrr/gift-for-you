import { ApiError, type Api, type PhotoVerdict, type Published } from './api'
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

export type PurchaseProof = { platform: string; transactionId: string }

/** Store purchase. Only the sandbox mock exists in this tree (RevenueCat / StoreKit / Play Billing later). */
export interface Store {
  readonly label: string
  purchase(giftId: string): Promise<PurchaseProof>
}

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

export async function purchaseAndPublish(
  giftId: string,
  store: Store,
  api: Api,
  onStage: (stage: PublishStage) => void = () => {},
): Promise<Published> {
  onStage('purchase')
  const proof = await store.purchase(giftId)
  await api.purchase(giftId, proof)
  onStage('issue')
  const published = await api.publish(giftId)
  onStage('done')
  return published
}
