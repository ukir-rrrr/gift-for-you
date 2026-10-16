export type GiftRow = {
  id: string
  device_id: string
  status: 'draft' | 'published' | 'revoked' | 'expired'
  share_id: string | null
  to_name: string | null
  share_json: string | null
  reveal_json: string | null
  passphrase_hash: string | null
  revoke_hash: string | null
  purchase_tx: string | null
  created_at: number
  published_at: number | null
  expires_at: number | null
  ended_at: number | null
  opened_at: number | null
  goal_at: number | null
  opened_count: number
  goal_count: number
}

export type PhotoRow = { gift_id: string; ref: string; status: 'approved' | 'rejected'; reason: string | null; bytes: number }

export const photoKey = (giftId: string, ref: string) => `gifts/${giftId}/${ref}.jpg`

export async function giftById(db: D1Database, id: string): Promise<GiftRow | null> {
  return db.prepare('SELECT * FROM gifts WHERE id = ?').bind(id).first<GiftRow>()
}

export async function giftByShareId(db: D1Database, shareId: string): Promise<GiftRow | null> {
  return db.prepare('SELECT * FROM gifts WHERE share_id = ?').bind(shareId).first<GiftRow>()
}

/** Published and not past its expiry. Expired rows the cron has not swept yet count as gone. */
export function live(gift: GiftRow | null, now: number): gift is GiftRow {
  return Boolean(gift && gift.status === 'published' && gift.expires_at !== null && gift.expires_at > now)
}

export async function photosOf(db: D1Database, giftId: string): Promise<PhotoRow[]> {
  const { results } = await db.prepare('SELECT * FROM photos WHERE gift_id = ?').bind(giftId).all<PhotoRow>()
  return results
}

async function deletePrefix(bucket: R2Bucket, prefix: string): Promise<void> {
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, cursor })
    const keys = page.objects.map((object) => object.key)
    if (keys.length > 0) await bucket.delete(keys)
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
}

/** Revokes or expires a gift: photos leave R2, content leaves D1. The share id stays reserved and keeps answering 404. */
export async function endGift(db: D1Database, bucket: R2Bucket, gift: GiftRow, status: 'revoked' | 'expired', now: number): Promise<void> {
  await deletePrefix(bucket, `gifts/${gift.id}/`)
  await db.batch([
    db.prepare('DELETE FROM photos WHERE gift_id = ?').bind(gift.id),
    db
      .prepare(
        `UPDATE gifts SET status = ?, ended_at = ?, share_json = NULL, reveal_json = NULL,
         passphrase_hash = NULL, revoke_hash = NULL WHERE id = ?`,
      )
      .bind(status, now, gift.id),
  ])
}

/** Drafts never published leave no trace at all. */
export async function deleteDraft(db: D1Database, bucket: R2Bucket, giftId: string): Promise<void> {
  await deletePrefix(bucket, `gifts/${giftId}/`)
  await db.batch([
    db.prepare('DELETE FROM photos WHERE gift_id = ?').bind(giftId),
    db.prepare("DELETE FROM gifts WHERE id = ? AND status = 'draft'").bind(giftId),
  ])
}

/**
 * Fixed-window counter. Returns false once `max` attempts were used inside `windowMs`.
 * One UPSERT, so two guesses racing each other cannot both slip under the limit.
 */
export async function takeAttempt(db: D1Database, key: string, max: number, windowMs: number, now: number): Promise<boolean> {
  const row = await db
    .prepare(
      `INSERT INTO attempts (key, window_start, count) VALUES (?1, ?2, 1)
       ON CONFLICT(key) DO UPDATE SET
         count = CASE WHEN ?2 - window_start >= ?3 THEN 1 ELSE count + 1 END,
         window_start = CASE WHEN ?2 - window_start >= ?3 THEN ?2 ELSE window_start END
       RETURNING count`,
    )
    .bind(key, now, windowMs)
    .first<{ count: number }>()
  return (row?.count ?? Number.POSITIVE_INFINITY) <= max
}

export async function sweep(db: D1Database, bucket: R2Bucket, now: number, draftTtlMs: number): Promise<{ expired: number; drafts: number }> {
  const { results: expired } = await db
    .prepare("SELECT * FROM gifts WHERE status = 'published' AND expires_at <= ? LIMIT 200")
    .bind(now)
    .all<GiftRow>()
  for (const gift of expired) await endGift(db, bucket, gift, 'expired', now)
  const { results: drafts } = await db
    .prepare("SELECT id FROM gifts WHERE status = 'draft' AND created_at <= ? LIMIT 200")
    .bind(now - draftTtlMs)
    .all<{ id: string }>()
  for (const draft of drafts) await deleteDraft(db, bucket, draft.id)
  await db.prepare('DELETE FROM attempts WHERE window_start <= ?').bind(now - 24 * 3600_000).run()
  return { expired: expired.length, drafts: drafts.length }
}
