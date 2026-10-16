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
  tier: string | null
  hidden_at: number | null
  hidden_reason: string | null
  ended_reason: string | null
}

export type EndReason = 'sender' | 'code' | 'expired' | 'operator' | 'account_deleted'

export type PhotoRow = { gift_id: string; ref: string; status: 'approved' | 'rejected'; reason: string | null; bytes: number }

export const photoKey = (giftId: string, ref: string) => `gifts/${giftId}/${ref}.jpg`

export async function giftById(db: D1Database, id: string): Promise<GiftRow | null> {
  return db.prepare('SELECT * FROM gifts WHERE id = ?').bind(id).first<GiftRow>()
}

export async function giftByShareId(db: D1Database, shareId: string): Promise<GiftRow | null> {
  return db.prepare('SELECT * FROM gifts WHERE share_id = ?').bind(shareId).first<GiftRow>()
}

/** Published, not hidden, and not past its expiry. Expired rows the cron has not swept yet count as gone. */
export function live(gift: GiftRow | null, now: number): gift is GiftRow {
  return Boolean(gift && gift.status === 'published' && gift.hidden_at === null && gift.expires_at !== null && gift.expires_at > now)
}

/** Holds a published gift back (reports, a removal request, an operator). Photos stay until it ends or is restored. */
export async function hideGift(db: D1Database, giftId: string, reason: string, now: number): Promise<boolean> {
  const result = await db
    .prepare("UPDATE gifts SET hidden_at = ?, hidden_reason = ? WHERE id = ? AND status = 'published' AND hidden_at IS NULL")
    .bind(now, reason, giftId)
    .run()
  return result.meta.changes === 1
}

/** The sender behind a gift for blocking: their account when signed in, else the device. */
export async function senderOf(db: D1Database, gift: GiftRow): Promise<string> {
  const device = await db.prepare('SELECT account_id FROM devices WHERE id = ?').bind(gift.device_id).first<{ account_id: string | null }>()
  return device?.account_id ? `a:${device.account_id}` : `d:${gift.device_id}`
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
export async function endGift(db: D1Database, bucket: R2Bucket, gift: GiftRow, reason: EndReason, now: number): Promise<void> {
  await deletePrefix(bucket, `gifts/${gift.id}/`)
  await db.batch([
    db.prepare('DELETE FROM photos WHERE gift_id = ?').bind(gift.id),
    db
      .prepare(
        `UPDATE gifts SET status = ?, ended_at = ?, ended_reason = ?, share_json = NULL, reveal_json = NULL,
         passphrase_hash = NULL, revoke_hash = NULL WHERE id = ?`,
      )
      .bind(reason === 'expired' ? 'expired' : 'revoked', now, reason, gift.id),
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

/** How long rows outlive the gift they describe. Content and photos are gone at the end already. */
export const RETENTION = {
  endedGiftMs: 30 * 24 * 3600_000,
  analyticsMs: 400 * 24 * 3600_000,
  resolvedMs: 180 * 24 * 3600_000,
  webhookMs: 90 * 24 * 3600_000,
} as const

export type SweepResult = { expired: number; drafts: number; purged: number }

/**
 * F3-06 cron: ends expired gifts (photos and content deleted), drops unpublished drafts, and purges
 * what is left of ended gifts after RETENTION.endedGiftMs, plus old reports, events, and attempts.
 */
export async function sweep(db: D1Database, bucket: R2Bucket, now: number, draftTtlMs: number): Promise<SweepResult> {
  const { results: expired } = await db
    .prepare("SELECT * FROM gifts WHERE status = 'published' AND expires_at <= ? LIMIT 200")
    .bind(now)
    .all<GiftRow>()
  for (const gift of expired) await endGift(db, bucket, gift, 'expired', now)
  if (expired.length > 0) {
    await db.prepare("INSERT INTO analytics_events (name, props, at) VALUES ('gift_expired', ?, ?)").bind(JSON.stringify({ n: expired.length }), now).run()
  }
  const { results: drafts } = await db
    .prepare("SELECT id FROM gifts WHERE status = 'draft' AND created_at <= ? LIMIT 200")
    .bind(now - draftTtlMs)
    .all<{ id: string }>()
  for (const draft of drafts) await deleteDraft(db, bucket, draft.id)
  await db.prepare('DELETE FROM attempts WHERE window_start <= ?').bind(now - 24 * 3600_000).run()
  const { results: old } = await db
    .prepare("SELECT id FROM gifts WHERE status IN ('revoked', 'expired') AND ended_at <= ? LIMIT 500")
    .bind(now - RETENTION.endedGiftMs)
    .all<{ id: string }>()
  for (const gift of old) await purgeGiftRows(db, gift.id)
  await db.batch([
    db.prepare('DELETE FROM analytics_events WHERE at <= ?').bind(now - RETENTION.analyticsMs),
    db.prepare("DELETE FROM reports WHERE status = 'resolved' AND created_at <= ?").bind(now - RETENTION.resolvedMs),
    db.prepare("DELETE FROM removal_requests WHERE status = 'resolved' AND resolved_at <= ?").bind(now - RETENTION.resolvedMs),
    db.prepare('DELETE FROM webhook_events WHERE received_at <= ?').bind(now - RETENTION.webhookMs),
  ])
  return { expired: expired.length, drafts: drafts.length, purged: old.length }
}

/** Removes every row that names a gift. Purchases keep their accounting row without the link. */
export async function purgeGiftRows(db: D1Database, giftId: string): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM photos WHERE gift_id = ?').bind(giftId),
    db.prepare('DELETE FROM notifications WHERE gift_id = ?').bind(giftId),
    db.prepare('DELETE FROM thanks WHERE gift_id = ?').bind(giftId),
    db.prepare('DELETE FROM reports WHERE gift_id = ?').bind(giftId),
    db.prepare('UPDATE removal_requests SET gift_id = NULL WHERE gift_id = ?').bind(giftId),
    db.prepare('UPDATE blocks SET gift_id = NULL WHERE gift_id = ?').bind(giftId),
    db.prepare('UPDATE purchases SET gift_id = NULL, app_user_id = NULL WHERE gift_id = ?').bind(giftId),
    db.prepare('DELETE FROM gifts WHERE id = ?').bind(giftId),
  ])
}

/**
 * F3-12 account deletion: every gift of every device on the account (or just this device) ends,
 * then every row about them goes, including the sign-in links. Unspent purchases lose their owner.
 */
export async function deleteAccount(db: D1Database, bucket: R2Bucket, deviceId: string): Promise<{ gifts: number }> {
  const device = await db.prepare('SELECT account_id FROM devices WHERE id = ?').bind(deviceId).first<{ account_id: string | null }>()
  const accountId = device?.account_id ?? null
  const { results: devices } = accountId
    ? await db.prepare('SELECT id FROM devices WHERE account_id = ?').bind(accountId).all<{ id: string }>()
    : { results: [{ id: deviceId }] }
  let count = 0
  for (const { id } of devices) {
    const { results: gifts } = await db.prepare('SELECT * FROM gifts WHERE device_id = ?').bind(id).all<GiftRow>()
    for (const gift of gifts) {
      await deletePrefix(bucket, `gifts/${gift.id}/`)
      await purgeGiftRows(db, gift.id)
      count += 1
    }
    await db.batch([
      db.prepare('UPDATE purchases SET app_user_id = NULL WHERE app_user_id = ?').bind(`gfy_${id}`),
      db.prepare('DELETE FROM blocks WHERE sender_id = ?').bind(`d:${id}`),
      db.prepare('DELETE FROM devices WHERE id = ?').bind(id),
    ])
  }
  if (accountId) {
    await db.batch([
      db.prepare('DELETE FROM blocks WHERE sender_id = ?').bind(`a:${accountId}`),
      db.prepare('DELETE FROM account_links WHERE account_id = ?').bind(accountId),
      db.prepare('DELETE FROM accounts WHERE id = ?').bind(accountId),
    ])
  }
  return { gifts: count }
}
