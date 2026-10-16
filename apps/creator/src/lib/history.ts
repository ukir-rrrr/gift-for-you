import type { RemoteGift } from './api'
import type { LocalGift } from './storage'

export type HistoryStatus = 'published' | 'revoked' | 'expired' | 'unknown'

export type HistoryRow = { giftId: string; toName: string; status: HistoryStatus; expiresAt: string | null; opened: boolean; goal: boolean }

export const HISTORY_STATUS: Record<HistoryStatus, string> = { published: '公開中', revoked: '失効', expired: '期限切れ', unknown: '確認できません' }

/**
 * Gifts this device published (local list) joined with what the server knows for this device key.
 * Offline, local entries still show; a local entry the server no longer lists is "unknown".
 */
export function mergeHistory(local: LocalGift[], remote: RemoteGift[] | null): HistoryRow[] {
  const rows = new Map<string, HistoryRow>()
  for (const gift of local) {
    rows.set(gift.giftId, {
      giftId: gift.giftId,
      toName: gift.toName,
      status: remote ? 'unknown' : 'published',
      expiresAt: gift.expiresAt,
      opened: false,
      goal: false,
    })
  }
  for (const gift of remote ?? []) {
    const known = rows.get(gift.giftId)
    rows.set(gift.giftId, {
      giftId: gift.giftId,
      toName: gift.toName ?? known?.toName ?? '',
      status: gift.status,
      expiresAt: gift.expiresAt ? new Date(gift.expiresAt).toISOString() : (known?.expiresAt ?? null),
      opened: gift.openedAt !== null,
      goal: gift.goalAt !== null,
    })
  }
  return [...rows.values()]
}
