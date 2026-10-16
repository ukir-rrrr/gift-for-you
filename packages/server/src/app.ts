import { catalogIndex, templateById } from '@gfy/catalog'
import { MAX_EDGE, isJpeg, readJpegInfo, stripJpegMetadata } from '@gfy/imaging'
import {
  allowedDomains,
  checkEgiftUrl,
  LIMITS,
  parseRevealJson,
  parseShareJson,
  REPORT_DETAIL_MAX,
  REPORT_REASONS,
  sanitizeDisplay,
  textLength,
  thanksStamp,
  tierById,
  tierByProduct,
  type RevealJson,
  type ShareJson,
} from '@gfy/schema'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { adminRoutes, extraDomains } from './admin'
import { CLIENT_EVENTS, track, type EventName } from './analytics'
import {
  hashPassphrase,
  newAccountId,
  newGiftId,
  newRevokeCode,
  newShareId,
  normalizeRevokeCode,
  sha256Hex,
  timingSafeEqual,
  validDeviceKey,
  verifyPassphrase,
} from './crypto'
import { clientIp, configuredOrigin, DAY_MS, fail, json, noindex, publicOrigin, readJson, readLimited, type AppEnv, type Ctx } from './http'
import { legalHeaders, legalPage, LEGAL_PATHS, type LegalPage } from './legal'
import { revokePage } from './revoke-page'
import { appUserIdFor, createServices, ModerationUnavailable, PurchaseUnavailable, ServiceConfigError, type Services } from './services'
import {
  claimPurchase,
  deleteAccount,
  deleteDraft,
  endGift,
  giftById,
  giftByShareId,
  hideGift,
  live,
  photoKey,
  photosOf,
  senderKeys,
  takeAttempt,
  type GiftRow,
} from './store'

export type { AppEnv } from './http'

export const PHOTO_MAX_BYTES = 1_500_000
const CONTENT_MAX_BYTES = 64_000
const EVENT_MAX_BYTES = 2048
const DRAFTS_PER_DAY = 20
const UNLOCK_TRIES = { max: 5, windowMs: 10 * 60_000 }
const REVOKE_TRIES = { max: 10, windowMs: 3600_000 }
const REPORT_TRIES = { max: 10, windowMs: 3600_000 }
const REMOVAL_TRIES = { max: 5, windowMs: 3600_000 }
const ANALYTICS_TRIES = { max: 60, windowMs: 3600_000 }
/** Per address, for public writes that need no key (e-gift opens, blocks). */
const PUBLIC_EVENT_TRIES = { max: 30, windowMs: 3600_000 }
const PHOTO_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHARE_ID = /^[0-9A-Za-z]{10}$/
const VIEWER_KEY = /^[A-Za-z0-9_-]{22,64}$/
const EMAIL = /^[^\s@<>"]{1,64}@[^\s@<>"]{1,100}\.[^\s@<>"]{2,}$/

export type AppOptions = { now?: () => number }

/** Devices whose gifts this caller may see and manage: the whole account when signed in. */
async function ownerDevices(c: Ctx): Promise<string[]> {
  const accountId = c.get('accountId')
  if (!accountId) return [c.get('deviceId')]
  const { results } = await c.env.DB.prepare('SELECT id FROM devices WHERE account_id = ?').bind(accountId).all<{ id: string }>()
  return results.map((row) => row.id)
}

async function ownedGift(c: Ctx): Promise<GiftRow | null> {
  const gift = await giftById(c.env.DB, c.req.param('giftId') ?? '')
  if (!gift) return null
  return (await ownerDevices(c)).includes(gift.device_id) ? gift : null
}

type Content = { share: ShareJson; reveal: RevealJson; passphrase: string | null }

type ContentCheck = { ok: true; value: Content } | { ok: false; status: number; error: string; issues?: string[] }

/** Applies the server's rules on top of the Share/Reveal parsers. */
async function checkContent(input: unknown, services: Services, extraAllow: readonly string[]): Promise<ContentCheck> {
  const body = (input ?? {}) as { share?: unknown; reveal?: unknown; passphrase?: unknown }
  const share = parseShareJson(body.share, catalogIndex())
  if (!share.ok) return { ok: false, status: 422, error: 'invalid_share', issues: share.issues }
  const reveal = parseRevealJson(body.reveal)
  if (!reveal.ok) {
    const egiftIssue = reveal.issues.find((issue) => issue.startsWith('egift '))
    return { ok: false, status: 422, error: egiftIssue ? egiftIssue.replace(' ', '_') : 'invalid_reveal', issues: reveal.issues }
  }
  const s = share.value
  const r = reveal.value
  const template = templateById(s.course.templateId)
  if (!template || s.memoryCoins.length === 0 || s.memoryCoins.length > template.coinSlots) {
    return { ok: false, status: 422, error: 'coin_count' }
  }
  const passphrase = typeof body.passphrase === 'string' && body.passphrase.length > 0 ? body.passphrase : null
  if (passphrase !== null) {
    const length = textLength(passphrase)
    if (length < LIMITS.passphraseMin || length > LIMITS.passphraseMax) return { ok: false, status: 422, error: 'passphrase_length' }
    if (!r.egift) return { ok: false, status: 422, error: 'passphrase_without_egift' }
  }
  let domain: string | undefined
  if (r.egift) {
    if (r.egift.locked) return { ok: false, status: 422, error: 'invalid_reveal' }
    if (r.egift.kind === 'url') {
      if (!r.egift.url) return { ok: false, status: 422, error: 'egift_missing' }
      const check = checkEgiftUrl(r.egift.url, extraAllow)
      if (check.status === 'block') return { ok: false, status: 422, error: `egift_${check.reason}` }
      domain = check.domain
      delete r.egift.code
    } else {
      if (!r.egift.code) return { ok: false, status: 422, error: 'egift_missing' }
      delete r.egift.url
    }
  }
  const texts = [s.from.displayName, s.to.displayName, s.goal.giftItem.label, r.letter.body, ...s.memoryCoins.map((coin) => coin.message)]
  const verdict = await services.moderator.text(texts.join('\n'))
  if (!verdict.ok) return { ok: false, status: 422, error: 'text_rejected' }
  // The server owns these: the URL lives only in the reveal, the flags follow what was stored.
  s.goal.letter = { present: true }
  s.goal.egift = r.egift
    ? { present: true, kind: r.egift.kind, ...(domain ? { domain } : {}), passphrase: passphrase !== null }
    : { present: false }
  delete s.expiresAt
  return { ok: true, value: { share: s, reveal: r, passphrase } }
}

function coinRefs(share: ShareJson): string[] {
  return share.memoryCoins.map((coin) => coin.photoRef)
}

async function pushToSender(c: Ctx, gift: GiftRow, body: string, type: string) {
  const services = c.get('services')
  const db = c.env.DB
  const device = await db.prepare('SELECT push_token FROM devices WHERE id = ?').bind(gift.device_id).first<{ push_token: string | null }>()
  if (!device?.push_token) return
  try {
    const outcome = await services.notifier.send({ token: device.push_token, title: 'gift-for-you', body, data: { giftId: gift.id, type } })
    if (outcome === 'gone') await db.prepare('UPDATE devices SET push_token = NULL, push_platform = NULL WHERE id = ?').bind(gift.device_id).run()
  } catch {
    // A failed push is not retried; what it reports is already stored.
  }
}

async function notifyOnce(c: Ctx, gift: GiftRow, type: 'opened' | 'goal_reached') {
  const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO notifications (gift_id, type, created_at) VALUES (?, ?, ?)')
    .bind(gift.id, type, c.get('services').now())
    .run()
  if (inserted.meta.changes !== 1) return
  const name = gift.to_name ?? ''
  await pushToSender(c, gift, type === 'opened' ? `${name}さんがギフトを開きました` : `${name}さんがゴールにたどりつきました`, type)
}

const event = (c: Ctx, name: EventName, props: Record<string, string | number | boolean> = {}) =>
  track(c.env.DB, name, c.get('services').now(), props)

/** Salted so a stored hash cannot be turned back into an IP or viewer key by trying them all. */
const saltedHash = (c: Ctx, ...parts: string[]) => sha256Hex([c.env.HASH_SALT ?? '', ...parts].join('|'))

type PurchaseRow = {
  transaction_id: string
  app_user_id: string | null
  product_id: string
  gift_id: string | null
  refunded_at: number | null
  is_sandbox: number
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>()

  app.onError((err, c) => {
    if (err instanceof ServiceConfigError) return fail(c, 503, 'not_configured')
    if (err instanceof ModerationUnavailable) return fail(c, 503, 'moderation_unavailable')
    if (err instanceof PurchaseUnavailable) return fail(c, 503, 'purchase_unavailable')
    console.error(err)
    return fail(c, 500, 'internal')
  })

  app.use('*', async (c, next) => {
    c.set('services', createServices(c.env, options.now))
    await next()
  })

  app.use(
    '/api/*',
    cors({
      origin: (origin, c: Ctx) => {
        const allowed = (c.env.CORS_ORIGINS ?? '').split(',').map((entry) => entry.trim()).filter(Boolean)
        return allowed.includes(origin) ? origin : null
      },
      allowHeaders: ['authorization', 'content-type'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxAge: 600,
    }),
  )

  app.get('/api/health', (c) => json(c, 200, { ok: true }))

  app.get('/api/_mock/push', async (c) => {
    if (c.env.MOCK_INSPECT !== '1') return fail(c, 404, 'not_found')
    const { results } = await c.env.DB.prepare('SELECT token, title, body, data FROM mock_push_outbox ORDER BY id').all()
    return json(c, 200, { sent: results })
  })

  // Every other /api route belongs to one anonymous device.
  app.use('/api/*', async (c, next) => {
    if (c.req.method === 'OPTIONS') return next()
    const match = (c.req.header('authorization') ?? '').match(/^Device ([A-Za-z0-9_-]+)$/)
    if (!match || !validDeviceKey(match[1])) return fail(c, 401, 'device_key')
    const deviceId = await sha256Hex(match[1])
    await c.env.DB.prepare('INSERT OR IGNORE INTO devices (id, created_at) VALUES (?, ?)').bind(deviceId, c.get('services').now()).run()
    const device = await c.env.DB.prepare('SELECT account_id FROM devices WHERE id = ?').bind(deviceId).first<{ account_id: string | null }>()
    c.set('deviceId', deviceId)
    c.set('accountId', device?.account_id ?? null)
    await next()
  })

  app.put('/api/devices/push', async (c) => {
    const body = (await readJson(c, 1024)) as { token?: unknown; platform?: unknown } | undefined
    const token = typeof body?.token === 'string' ? body.token : ''
    const platform = body?.platform
    if (!/^[\w[\]:.-]{8,200}$/.test(token) || !['expo', 'ios', 'android', 'mock'].includes(String(platform))) {
      return fail(c, 400, 'invalid_token')
    }
    await c.env.DB.prepare('UPDATE devices SET push_token = ?, push_platform = ? WHERE id = ?').bind(token, platform, c.get('deviceId')).run()
    return c.body(null, 204)
  })

  app.delete('/api/devices/push', async (c) => {
    await c.env.DB.prepare('UPDATE devices SET push_token = NULL, push_platform = NULL WHERE id = ?').bind(c.get('deviceId')).run()
    return c.body(null, 204)
  })

  app.post('/api/analytics', async (c) => {
    const body = (await readJson(c, 1024)) as { name?: unknown; props?: unknown } | undefined
    const name = String(body?.name ?? '') as EventName
    if (!CLIENT_EVENTS.includes(name)) return fail(c, 400, 'unknown_event')
    // Per device; past the limit events are dropped quietly so the app never notices.
    if (!(await takeAttempt(c.env.DB, `analytics:${c.get('deviceId')}`, ANALYTICS_TRIES.max, ANALYTICS_TRIES.windowMs, c.get('services').now()))) {
      return c.body(null, 204)
    }
    await track(c.env.DB, name, c.get('services').now(), (body?.props ?? {}) as Record<string, string>)
    return c.body(null, 204)
  })

  app.post('/api/gifts', async (c) => {
    const now = c.get('services').now()
    const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM gifts WHERE device_id = ? AND created_at > ?')
      .bind(c.get('deviceId'), now - DAY_MS)
      .first<{ n: number }>()
    if ((recent?.n ?? 0) >= DRAFTS_PER_DAY) return fail(c, 429, 'too_many_gifts')
    const id = newGiftId()
    await c.env.DB.prepare("INSERT INTO gifts (id, device_id, status, created_at) VALUES (?, ?, 'draft', ?)").bind(id, c.get('deviceId'), now).run()
    await event(c, 'gift_created')
    return json(c, 201, { giftId: id })
  })

  app.get('/api/gifts', async (c) => {
    const now = c.get('services').now()
    const devices = await ownerDevices(c)
    const { results } = await c.env.DB.prepare(
      `SELECT g.id, g.status, g.share_id, g.to_name, g.created_at, g.published_at, g.expires_at, g.ended_at, g.opened_at, g.goal_at,
       g.opened_count, g.goal_count, g.tier, g.hidden_at, t.stamp AS thanks
       FROM gifts g LEFT JOIN thanks t ON t.gift_id = g.id
       WHERE g.device_id IN (SELECT value FROM json_each(?)) AND g.status != 'draft' ORDER BY g.created_at DESC LIMIT 100`,
    )
      .bind(JSON.stringify(devices))
      .all<GiftRow & { thanks: string | null }>()
    // Listing never fails on a missing origin; rows just carry no link.
    const origin = configuredOrigin(c.env)
    return json(c, 200, {
      gifts: results.map((gift) => {
        const ended = gift.status === 'published' && (gift.expires_at ?? 0) <= now ? 'expired' : gift.status
        const status = ended === 'published' && gift.hidden_at ? 'hidden' : ended
        return {
          giftId: gift.id,
          status,
          shareId: gift.share_id,
          url: status === 'published' && gift.share_id && origin ? `${origin}/g/${gift.share_id}` : null,
          toName: gift.to_name,
          tier: gift.tier,
          createdAt: gift.created_at,
          publishedAt: gift.published_at,
          expiresAt: gift.expires_at,
          endedAt: gift.ended_at,
          openedAt: gift.opened_at,
          goalAt: gift.goal_at,
          openedCount: gift.opened_count,
          goalCount: gift.goal_count,
          thanks: gift.thanks,
        }
      }),
    })
  })

  app.put('/api/gifts/:giftId/photos/:ref', async (c) => {
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    if (gift.status !== 'draft') return fail(c, 409, 'not_draft')
    const ref = c.req.param('ref')
    if (!PHOTO_REF.test(ref) || ref.length > 80) return fail(c, 400, 'invalid_ref')
    const existing = await photosOf(c.env.DB, gift.id)
    if (!existing.some((photo) => photo.ref === ref) && existing.length >= LIMITS.coins) return fail(c, 409, 'too_many_photos')
    const raw = await readLimited(c, PHOTO_MAX_BYTES)
    if (!raw) return fail(c, 413, 'too_large')
    if (!isJpeg(raw)) return fail(c, 415, 'not_jpeg')
    let bytes: Uint8Array
    let size: { width: number; height: number }
    try {
      // The app strips metadata already; doing it again here means a modified client cannot leak GPS either.
      bytes = stripJpegMetadata(raw)
      size = readJpegInfo(bytes)
    } catch {
      return fail(c, 415, 'not_jpeg')
    }
    if (Math.max(size.width, size.height) > MAX_EDGE) return fail(c, 422, 'too_many_pixels')
    // F3-04: a moderation outage throws (503) instead of approving the photo.
    const verdict = await c.get('services').moderator.image(bytes)
    const now = c.get('services').now()
    if (verdict.ok) {
      await c.env.PHOTOS.put(photoKey(gift.id, ref), bytes, { httpMetadata: { contentType: 'image/jpeg' } })
    } else {
      // A rejected image is not kept.
      await c.env.PHOTOS.delete(photoKey(gift.id, ref))
      await event(c, 'photo_rejected', { reason: verdict.reason })
    }
    await c.env.DB.prepare('INSERT OR REPLACE INTO photos (gift_id, ref, status, reason, bytes, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(gift.id, ref, verdict.ok ? 'approved' : 'rejected', verdict.ok ? null : verdict.reason, bytes.length, now)
      .run()
    return json(c, 200, { ref, status: verdict.ok ? 'approved' : 'rejected', ...(verdict.ok ? {} : { reason: verdict.reason }) })
  })

  app.delete('/api/gifts/:giftId/photos/:ref', async (c) => {
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    if (gift.status !== 'draft') return fail(c, 409, 'not_draft')
    const ref = c.req.param('ref')
    await c.env.PHOTOS.delete(photoKey(gift.id, ref))
    await c.env.DB.prepare('DELETE FROM photos WHERE gift_id = ? AND ref = ?').bind(gift.id, ref).run()
    return c.body(null, 204)
  })

  app.put('/api/gifts/:giftId/content', async (c) => {
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    if (gift.status !== 'draft') return fail(c, 409, 'not_draft')
    const body = await readJson(c, CONTENT_MAX_BYTES)
    if (body === undefined) return fail(c, 400, 'invalid_json')
    const checked = await checkContent(body, c.get('services'), await extraDomains(c.env.DB))
    if (!checked.ok) {
      if (checked.error === 'text_rejected') await event(c, 'text_rejected')
      return fail(c, checked.status, checked.error, checked.issues ? { issues: checked.issues } : {})
    }
    const { share, reveal, passphrase } = checked.value
    const photos = await photosOf(c.env.DB, gift.id)
    const missing = coinRefs(share).filter((ref) => !photos.some((photo) => photo.ref === ref))
    if (missing.length > 0) return fail(c, 422, 'photo_missing', { refs: missing })
    const rejected = photos.filter((photo) => photo.status === 'rejected' && coinRefs(share).includes(photo.ref)).map((photo) => photo.ref)
    if (rejected.length > 0) return fail(c, 422, 'photo_rejected', { refs: rejected })
    await c.env.DB.prepare('UPDATE gifts SET share_json = ?, reveal_json = ?, passphrase_hash = ?, to_name = ? WHERE id = ?')
      .bind(JSON.stringify(share), JSON.stringify(reveal), passphrase ? await hashPassphrase(passphrase) : null, share.to.displayName, gift.id)
      .run()
    return json(c, 200, { ok: true, share })
  })

  // F3-03: purchases this device made that no gift has used yet (a publish that never finished).
  app.get('/api/purchases/unclaimed', async (c) => {
    const { results } = await c.env.DB.prepare(
      'SELECT transaction_id, product_id FROM purchases WHERE app_user_id = ? AND gift_id IS NULL AND refunded_at IS NULL ORDER BY purchased_at',
    )
      .bind(appUserIdFor(c.get('deviceId')))
      .all<{ transaction_id: string; product_id: string }>()
    return json(c, 200, {
      purchases: results.map((row) => ({ transactionId: row.transaction_id, productId: row.product_id, tier: tierByProduct(row.product_id)?.id ?? null })),
    })
  })

  // F3-03: consumables are not restorable, so the app hands over store transactions it has not
  // seen through (a crash between paying and publishing). Verified ones become credits.
  app.post('/api/purchases', async (c) => {
    const body = (await readJson(c, 4096)) as { platform?: unknown; transactionId?: unknown; productId?: unknown } | undefined
    const transactionId = String(body?.transactionId ?? '')
    const appUserId = appUserIdFor(c.get('deviceId'))
    const db = c.env.DB
    const known = await db.prepare('SELECT * FROM purchases WHERE transaction_id = ?').bind(transactionId).first<PurchaseRow>()
    if (known) {
      if (known.app_user_id !== appUserId) return fail(c, 409, 'purchase_used')
      return json(c, 200, { transactionId: known.transaction_id, tier: tierByProduct(known.product_id)?.id ?? null, claimed: known.gift_id !== null })
    }
    const result = await c.get('services').purchases.verify(
      { platform: String(body?.platform ?? ''), transactionId, productId: typeof body?.productId === 'string' ? body.productId : undefined },
      appUserId,
    )
    if (!result.ok) return fail(c, 402, 'purchase_invalid', { reason: result.reason })
    const now = c.get('services').now()
    await db
      .prepare(
        `INSERT OR IGNORE INTO purchases (transaction_id, app_user_id, product_id, store, is_sandbox, purchased_at, source, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'sync', ?)`,
      )
      .bind(result.transactionId, result.appUserId, result.productId, result.store, result.isSandbox ? 1 : 0, result.purchasedAt, now)
      .run()
    const row = await db.prepare('SELECT * FROM purchases WHERE transaction_id = ?').bind(result.transactionId).first<PurchaseRow>()
    if (!row || row.app_user_id !== appUserId) return fail(c, 409, 'purchase_used')
    return json(c, 200, { transactionId: row.transaction_id, tier: tierByProduct(row.product_id)?.id ?? null, claimed: row.gift_id !== null })
  })

  app.post('/api/gifts/:giftId/purchase', async (c) => {
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    if (gift.status !== 'draft') return fail(c, 409, 'not_draft')
    const body = (await readJson(c, 4096)) as { platform?: unknown; transactionId?: unknown; productId?: unknown } | undefined
    const transactionId = String(body?.transactionId ?? '')
    // Only the same transaction is answered "done" for a bought gift. Any other one goes on to be
    // verified: if it holds it is kept as a credit and refused as purchase_used, else purchase_invalid.
    if (gift.purchase_tx && (gift.purchase_tx === transactionId || gift.purchase_tx === `sandbox:${transactionId}`)) {
      return json(c, 200, { ok: true, tier: gift.tier })
    }
    const appUserId = appUserIdFor(c.get('deviceId'))
    const db = c.env.DB
    const now = c.get('services').now()
    // A purchase the webhook (or an earlier attempt) already recorded for this device is used as is.
    let row = transactionId
      ? await db.prepare('SELECT * FROM purchases WHERE transaction_id = ? AND app_user_id = ?').bind(transactionId, appUserId).first<PurchaseRow>()
      : null
    if (!row) {
      const result = await c.get('services').purchases.verify(
        { platform: String(body?.platform ?? ''), transactionId, productId: typeof body?.productId === 'string' ? body.productId : undefined },
        appUserId,
      )
      if (!result.ok) return fail(c, 402, 'purchase_invalid', { reason: result.reason })
      await db
        .prepare(
          `INSERT OR IGNORE INTO purchases (transaction_id, app_user_id, product_id, store, is_sandbox, purchased_at, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'verify', ?)`,
        )
        .bind(result.transactionId, result.appUserId, result.productId, result.store, result.isSandbox ? 1 : 0, result.purchasedAt, now)
        .run()
      row = await db.prepare('SELECT * FROM purchases WHERE transaction_id = ?').bind(result.transactionId).first<PurchaseRow>()
    }
    // Strict: a row with no owner (its account was deleted) is not anyone's to claim.
    if (!row || row.app_user_id !== appUserId) return fail(c, 409, 'purchase_used')
    if (row.refunded_at !== null) return fail(c, 402, 'purchase_invalid', { reason: 'refunded' })
    const tier = tierByProduct(row.product_id)
    if (!tier) return fail(c, 402, 'purchase_invalid', { reason: 'product' })
    // A purchase already on this gift (a retry after a dropped answer) counts as done.
    if (row.gift_id !== null && row.gift_id !== gift.id) return fail(c, 409, 'purchase_used')
    const claimed = await claimPurchase(db, gift.id, row.transaction_id, tier.id)
    if (!claimed) return fail(c, 409, 'purchase_used')
    await event(c, 'purchase_verified', { tier: tier.id, sandbox: row.is_sandbox === 1 })
    return json(c, 200, { ok: true, tier: tier.id })
  })

  app.post('/api/gifts/:giftId/publish', async (c) => {
    // Checked before anything changes, so a misconfigured deploy never half-publishes.
    const origin = publicOrigin(c.env)
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    if (gift.status !== 'draft') return fail(c, 409, 'not_draft')
    if (!gift.share_json || !gift.reveal_json) return fail(c, 409, 'no_content')
    if (!gift.purchase_tx) return fail(c, 402, 'not_purchased')
    const share = JSON.parse(gift.share_json) as ShareJson
    const refs = coinRefs(share)
    const photos = await photosOf(c.env.DB, gift.id)
    const approved = new Set(photos.filter((photo) => photo.status === 'approved').map((photo) => photo.ref))
    const blocked = refs.filter((ref) => !approved.has(ref))
    if (blocked.length > 0) return fail(c, 422, 'photo_rejected', { refs: blocked })
    // Photos uploaded but not used by any coin are not published.
    for (const photo of photos.filter((entry) => !refs.includes(entry.ref))) {
      await c.env.PHOTOS.delete(photoKey(gift.id, photo.ref))
      await c.env.DB.prepare('DELETE FROM photos WHERE gift_id = ? AND ref = ?').bind(gift.id, photo.ref).run()
    }
    const now = c.get('services').now()
    // F3-06: the tier bought sets how long the link opens.
    const tier = tierById(gift.tier ?? '') ?? tierById('standard')!
    const expiresAt = now + tier.ttlDays * DAY_MS
    const published = { ...share, expiresAt: new Date(expiresAt).toISOString() }
    const revokeCode = newRevokeCode()
    const revokeHash = await sha256Hex(normalizeRevokeCode(revokeCode))
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const shareId = newShareId()
      const result = await c.env.DB.prepare(
        `UPDATE gifts SET status = 'published', share_id = ?, share_json = ?, revoke_hash = ?, published_at = ?, expires_at = ?
         WHERE id = ? AND status = 'draft' AND NOT EXISTS (SELECT 1 FROM gifts WHERE share_id = ?)`,
      )
        .bind(shareId, JSON.stringify(published), revokeHash, now, expiresAt, gift.id, shareId)
        .run()
      if (result.meta.changes === 1) {
        await event(c, 'gift_published', { tier: tier.id, template: share.course.templateId, difficulty: share.course.difficulty, coins: refs.length })
        return json(c, 201, {
          shareId,
          url: `${origin}/g/${shareId}`,
          expiresAt: published.expiresAt,
          revokeCode,
          revokeUrl: `${origin}/r/${shareId}`,
          tier: tier.id,
        })
      }
      const again = await giftById(c.env.DB, gift.id)
      if (again?.status !== 'draft') return fail(c, 409, 'not_draft')
    }
    return fail(c, 500, 'share_id')
  })

  app.delete('/api/gifts/:giftId', async (c) => {
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    const now = c.get('services').now()
    if (gift.status === 'draft') await deleteDraft(c.env.DB, c.env.PHOTOS, gift.id)
    else if (gift.status === 'published') {
      await endGift(c.env.DB, c.env.PHOTOS, gift, 'sender', now)
      await event(c, 'gift_revoked', { by: 'sender' })
    }
    return c.body(null, 204)
  })

  // F3-12: sign-in link and account deletion.
  app.get('/api/account', async (c) => {
    const accountId = c.get('accountId')
    if (!accountId) return json(c, 200, { linked: [] })
    const { results } = await c.env.DB.prepare('SELECT provider FROM account_links WHERE account_id = ? ORDER BY provider').bind(accountId).all<{ provider: string }>()
    return json(c, 200, { linked: results.map((row) => row.provider) })
  })

  app.post('/api/account/link', async (c) => {
    const body = (await readJson(c, 8192)) as { provider?: unknown; idToken?: unknown } | undefined
    const provider = String(body?.provider ?? '')
    const result = await c.get('services').signIn.verify(provider, String(body?.idToken ?? ''))
    if (!result.ok) return fail(c, 401, 'signin_invalid', { reason: result.reason })
    const db = c.env.DB
    const now = c.get('services').now()
    const subjectHash = await sha256Hex(`${result.provider}:${result.subject}`)
    const existing = await db.prepare('SELECT account_id FROM account_links WHERE provider = ? AND subject_hash = ?').bind(result.provider, subjectHash).first<{ account_id: string }>()
    let accountId = existing?.account_id ?? c.get('accountId')
    if (!accountId) {
      accountId = newAccountId()
      await db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').bind(accountId, now).run()
    }
    if (!existing) {
      await db.prepare('INSERT INTO account_links (provider, subject_hash, account_id, created_at) VALUES (?, ?, ?, ?)').bind(result.provider, subjectHash, accountId, now).run()
    }
    await db.prepare('UPDATE devices SET account_id = ? WHERE id = ?').bind(accountId, c.get('deviceId')).run()
    await event(c, 'account_linked', { provider: result.provider })
    return json(c, 200, { linked: true, provider: result.provider })
  })

  app.delete('/api/account', async (c) => {
    await deleteAccount(c.env.DB, c.env.PHOTOS, c.get('deviceId'))
    await event(c, 'account_deleted')
    return c.body(null, 204)
  })

  // F3-03: RevenueCat tells us about purchases even when the app never got to call /purchase.
  app.post('/webhooks/revenuecat', async (c) => {
    const expected = c.env.REVENUECAT_WEBHOOK_AUTH
    if (!expected) return fail(c, 503, 'not_configured')
    const given = c.req.header('authorization') ?? ''
    if (!timingSafeEqual(await sha256Hex(given), await sha256Hex(expected))) return fail(c, 401, 'unauthorized')
    const body = (await readJson(c, 64_000)) as { event?: Record<string, unknown> } | undefined
    const ev = body?.event
    if (!ev || typeof ev.id !== 'string' || typeof ev.type !== 'string') return fail(c, 400, 'invalid_event')
    const db = c.env.DB
    const now = c.get('services').now()
    const transactionId = typeof ev.transaction_id === 'string' ? ev.transaction_id : ''
    const productId = typeof ev.product_id === 'string' ? ev.product_id : ''
    const sandbox = ev.environment === 'SANDBOX'
    // The event id and what it records go in one batch: if recording fails, the id is not kept and
    // RevenueCat's retry is processed instead of being taken for a duplicate. Both writes are idempotent.
    const writes = [db.prepare('INSERT OR IGNORE INTO webhook_events (id, type, received_at) VALUES (?, ?, ?)').bind(ev.id, ev.type, now)]
    if (ev.type === 'NON_RENEWING_PURCHASE' && transactionId && tierByProduct(productId) && !(sandbox && c.env.REVENUECAT_ALLOW_SANDBOX === '0')) {
      const appUserId = typeof ev.app_user_id === 'string' ? ev.app_user_id : null
      writes.push(
        db
          .prepare(
            `INSERT OR IGNORE INTO purchases (transaction_id, app_user_id, product_id, store, is_sandbox, purchased_at, source, created_at)
             VALUES (?, ?, ?, ?, ?, ?, 'webhook', ?)`,
          )
          .bind(transactionId, appUserId, productId, String(ev.store ?? 'unknown').toLowerCase(), sandbox ? 1 : 0, Number(ev.purchased_at_ms ?? now), now),
      )
    }
    // A refunded consumable arrives as CANCELLATION. The gift stays; the operator sees the refund.
    if ((ev.type === 'CANCELLATION' || ev.type === 'REFUND') && transactionId) {
      writes.push(db.prepare('UPDATE purchases SET refunded_at = ? WHERE transaction_id = ? AND refunded_at IS NULL').bind(now, transactionId))
    }
    const [fresh] = await db.batch(writes)
    if (fresh.meta.changes !== 1) return json(c, 200, { ok: true, duplicate: true })
    return json(c, 200, { ok: true })
  })

  // Public routes the player calls. Unknown, revoked, hidden, and expired gifts all answer the same 404.
  app.use('/s/*', async (c, next) => {
    await next()
    noindex(c)
  })

  // The e-gift allowlist the player's confirm screen and the creator use (built in + operator-added).
  app.get('/s/egift-domains', async (c) => {
    const domains = [...allowedDomains(), ...(await extraDomains(c.env.DB))]
    return json(c, 200, { domains })
  })

  const liveGift = async (c: Ctx): Promise<GiftRow | null> => {
    const shareId = c.req.param('shareId') ?? ''
    if (!SHARE_ID.test(shareId)) return null
    const gift = await giftByShareId(c.env.DB, shareId)
    return live(gift, c.get('services').now()) ? gift : null
  }

  const viewerHash = (c: Ctx, viewer: string) => saltedHash(c, 'viewer', viewer)

  /**
   * F3-12: a recipient who blocked this sender does not get the gift's share, letter, or e-gift in
   * that browser. Matched against the sender's device and account, so a block made before the
   * sender signed in still holds after.
   */
  const blockedFor = async (c: Ctx, gift: GiftRow): Promise<boolean> => {
    const viewer = c.req.header('x-gfy-viewer') ?? ''
    if (!VIEWER_KEY.test(viewer)) return false
    const keys = await senderKeys(c.env.DB, gift)
    const hit = await c.env.DB.prepare(`SELECT 1 AS x FROM blocks WHERE viewer_hash = ? AND sender_id IN (${keys.map(() => '?').join(', ')})`)
      .bind(await viewerHash(c, viewer), ...keys)
      .first()
    return Boolean(hit)
  }

  app.get('/s/:shareId/share', async (c) => {
    const gift = await liveGift(c)
    if (!gift?.share_json) return fail(c, 404, 'not_found')
    if (await blockedFor(c, gift)) return fail(c, 403, 'blocked')
    return c.body(gift.share_json, 200, { 'content-type': 'application/json; charset=utf-8' })
  })

  app.get('/s/:shareId/photos/:ref', async (c) => {
    const gift = await liveGift(c)
    const ref = c.req.param('ref')
    if (!gift?.share_json || !coinRefs(JSON.parse(gift.share_json) as ShareJson).includes(ref)) return fail(c, 404, 'not_found')
    const object = await c.env.PHOTOS.get(photoKey(gift.id, ref))
    if (!object) return fail(c, 404, 'not_found')
    return c.body(object.body as ReadableStream, 200, {
      'content-type': 'image/jpeg',
      'x-content-type-options': 'nosniff',
    })
  })

  app.post('/s/:shareId/events', async (c) => {
    const body = (await readJson(c, EVENT_MAX_BYTES)) as { type?: unknown } | undefined
    const type = body?.type
    if (type !== 'opened' && type !== 'goal_reached' && type !== 'egift_opened') return c.body(null, 204)
    const gift = await liveGift(c)
    if (!gift) return c.body(null, 204)
    const now = c.get('services').now()
    if (type === 'egift_opened') {
      const ip = await saltedHash(c, 'ip', clientIp(c))
      if (await takeAttempt(c.env.DB, `egift-event:${ip}`, PUBLIC_EVENT_TRIES.max, PUBLIC_EVENT_TRIES.windowMs, now)) await event(c, 'egift_opened')
      return c.body(null, 204)
    }
    if (type === 'opened') {
      await c.env.DB.prepare('UPDATE gifts SET opened_count = opened_count + 1, opened_at = COALESCE(opened_at, ?) WHERE id = ?').bind(now, gift.id).run()
      if (gift.opened_at === null) await event(c, 'gift_opened')
    } else {
      await c.env.DB.prepare('UPDATE gifts SET goal_count = goal_count + 1, goal_at = COALESCE(goal_at, ?) WHERE id = ?').bind(now, gift.id).run()
      if (gift.goal_at === null) await event(c, 'goal_reached')
    }
    await notifyOnce(c, gift, type)
    return c.body(null, 204)
  })

  app.get('/s/:shareId/reveal', async (c) => {
    const gift = await liveGift(c)
    if (!gift?.reveal_json) return fail(c, 404, 'not_found')
    // The letter waits for a goal_reached beacon, as in Phase 1.
    if (gift.goal_at === null) return fail(c, 403, 'not_ready')
    if (await blockedFor(c, gift)) return fail(c, 403, 'blocked')
    const reveal = JSON.parse(gift.reveal_json) as RevealJson
    if (reveal.egift && gift.passphrase_hash) reveal.egift = { kind: reveal.egift.kind, locked: true }
    return json(c, 200, reveal)
  })

  app.post('/s/:shareId/unlock', async (c) => {
    const gift = await liveGift(c)
    if (!gift?.reveal_json || gift.goal_at === null) return fail(c, 404, 'not_found')
    if (await blockedFor(c, gift)) return fail(c, 403, 'blocked')
    const reveal = JSON.parse(gift.reveal_json) as RevealJson
    if (!reveal.egift) return fail(c, 404, 'not_found')
    if (!gift.passphrase_hash) return json(c, 200, reveal.egift)
    const allowed = await takeAttempt(c.env.DB, `unlock:${gift.id}`, UNLOCK_TRIES.max, UNLOCK_TRIES.windowMs, c.get('services').now())
    if (!allowed) return fail(c, 429, 'too_many_attempts')
    const body = (await readJson(c, 1024)) as { passphrase?: unknown } | undefined
    const attempt = typeof body?.passphrase === 'string' ? body.passphrase : ''
    if (!(await verifyPassphrase(attempt, gift.passphrase_hash))) return fail(c, 403, 'wrong')
    return json(c, 200, reveal.egift)
  })

  // F3-05: anyone with the link can report. Enough distinct reporters hide the gift until an operator looks.
  app.post('/s/:shareId/report', async (c) => {
    const gift = await liveGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    const body = (await readJson(c, 2048)) as { reason?: unknown; detail?: unknown } | undefined
    const reason = String(body?.reason ?? '')
    if (!REPORT_REASONS.some((entry) => entry.id === reason)) return fail(c, 400, 'invalid_reason')
    const detail = typeof body?.detail === 'string' ? [...sanitizeDisplay(body.detail).trim()].slice(0, REPORT_DETAIL_MAX).join('') : ''
    const now = c.get('services').now()
    const ip = clientIp(c)
    if (!(await takeAttempt(c.env.DB, `report:${await saltedHash(c, 'ip', ip)}`, REPORT_TRIES.max, REPORT_TRIES.windowMs, now))) {
      return fail(c, 429, 'too_many_reports')
    }
    const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO reports (gift_id, reporter_hash, reason, detail, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(gift.id, await saltedHash(c, 'reporter', ip, gift.id), reason, detail || null, now)
      .run()
    if (inserted.meta.changes === 1) await event(c, 'report_submitted', { reason })
    const threshold = Math.max(1, Number(c.env.REPORT_HIDE_THRESHOLD ?? '3') || 3)
    const open = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM reports WHERE gift_id = ? AND status = 'open'").bind(gift.id).first<{ n: number }>()
    if ((open?.n ?? 0) >= threshold && (await hideGift(c.env.DB, gift.id, 'reports', now))) await event(c, 'gift_hidden', { by: 'reports' })
    return json(c, 202, { ok: true })
  })

  // F3-12: the recipient's browser blocks this sender; their gifts stop opening there.
  app.post('/s/:shareId/block', async (c) => {
    const shareId = c.req.param('shareId')
    const gift = SHARE_ID.test(shareId) ? await giftByShareId(c.env.DB, shareId) : null
    if (!gift || gift.status !== 'published') return fail(c, 404, 'not_found')
    const body = (await readJson(c, 1024)) as { viewer?: unknown } | undefined
    const viewer = String(body?.viewer ?? '')
    if (!VIEWER_KEY.test(viewer)) return fail(c, 400, 'invalid_viewer')
    if (!(await takeAttempt(c.env.DB, `block:${await saltedHash(c, 'ip', clientIp(c))}`, PUBLIC_EVENT_TRIES.max, PUBLIC_EVENT_TRIES.windowMs, c.get('services').now()))) {
      return fail(c, 429, 'too_many_blocks')
    }
    const hash = await viewerHash(c, viewer)
    const now = c.get('services').now()
    // Both the device and (when signed in) the account, so later sign-ins or new devices stay blocked.
    const results = await c.env.DB.batch(
      (await senderKeys(c.env.DB, gift)).map((key) =>
        c.env.DB.prepare('INSERT OR IGNORE INTO blocks (viewer_hash, sender_id, gift_id, created_at) VALUES (?, ?, ?, ?)').bind(hash, key, gift.id, now),
      ),
    )
    if (results.some((result) => result.meta.changes === 1)) await event(c, 'sender_blocked')
    return c.body(null, 204)
  })

  // F3-09: one stamp back to the sender, after the goal.
  app.post('/s/:shareId/thanks', async (c) => {
    const gift = await liveGift(c)
    if (!gift || gift.goal_at === null) return fail(c, 404, 'not_found')
    const body = (await readJson(c, 1024)) as { stamp?: unknown } | undefined
    const stamp = thanksStamp(String(body?.stamp ?? ''))
    if (!stamp) return fail(c, 400, 'invalid_stamp')
    const now = c.get('services').now()
    const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO thanks (gift_id, stamp, created_at) VALUES (?, ?, ?)').bind(gift.id, stamp.id, now).run()
    if (inserted.meta.changes === 1) {
      await event(c, 'thanks_sent', { stamp: stamp.id })
      await pushToSender(c, gift, `${gift.to_name ?? ''}さんから「${stamp.label}」が届きました`, 'thanks')
    }
    const stored = await c.env.DB.prepare('SELECT stamp FROM thanks WHERE gift_id = ?').bind(gift.id).first<{ stamp: string }>()
    return json(c, 200, { stamp: stored?.stamp ?? stamp.id })
  })

  // Revoke from any browser with the code shown at publish time.
  app.get('/r/:shareId', (c) => {
    return c.html(revokePage({ state: 'form' }), 200, revokeHeaders())
  })

  app.post('/r/:shareId', async (c) => {
    const shareId = c.req.param('shareId')
    // Only a published gift has a revoke code to guess, so only its guesses are counted; other ids
    // (malformed, unknown, already ended) never add rows to the attempts table. That 429 shows up
    // only for live ids tells nothing new: GET /s/{id}/share already answers 200 or 404 per id.
    const gift = SHARE_ID.test(shareId) ? await giftByShareId(c.env.DB, shareId) : null
    if (!gift || gift.status !== 'published' || !gift.revoke_hash) return c.html(revokePage({ state: 'wrong' }), 403, revokeHeaders())
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
    const code = typeof form.code === 'string' ? form.code : ''
    const now = c.get('services').now()
    const allowed = await takeAttempt(c.env.DB, `revoke:${shareId}`, REVOKE_TRIES.max, REVOKE_TRIES.windowMs, now)
    if (!allowed) return c.html(revokePage({ state: 'busy' }), 429, revokeHeaders())
    const hash = await sha256Hex(normalizeRevokeCode(code))
    if (!timingSafeEqual(hash, gift.revoke_hash)) {
      return c.html(revokePage({ state: 'wrong' }), 403, revokeHeaders())
    }
    await endGift(c.env.DB, c.env.PHOTOS, gift, 'code', now)
    await event(c, 'gift_revoked', { by: 'code' })
    return c.html(revokePage({ state: 'done' }), 200, revokeHeaders())
  })

  // F3-05 pages. Drafts; see docs/phase3.md.
  for (const page of Object.keys(LEGAL_PATHS) as LegalPage[]) {
    app.get(LEGAL_PATHS[page], (c) => c.html(legalPage(page, c.env.SUPPORT_EMAIL), 200, legalHeaders()))
  }

  app.post(LEGAL_PATHS.removal, async (c) => {
    const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>)
    const url = String(form.url ?? '').trim()
    const contact = String(form.contact ?? '').trim()
    const relation = String(form.relation ?? '')
    const detail = [...sanitizeDisplay(String(form.detail ?? '')).trim()].slice(0, REPORT_DETAIL_MAX).join('')
    const shareId = url.match(/(?:^|\/g\/)([0-9A-Za-z]{10})(?:[/?#].*)?$/)?.[1] ?? null
    if (!shareId || !EMAIL.test(contact) || !['self', 'guardian', 'agent'].includes(relation)) {
      return c.html(legalPage('removal', c.env.SUPPORT_EMAIL, 'invalid'), 422, legalHeaders())
    }
    const now = c.get('services').now()
    if (!(await takeAttempt(c.env.DB, `removal:${await saltedHash(c, 'ip', clientIp(c))}`, REMOVAL_TRIES.max, REMOVAL_TRIES.windowMs, now))) {
      return c.html(legalPage('removal', c.env.SUPPORT_EMAIL, 'busy'), 429, legalHeaders())
    }
    const gift = await giftByShareId(c.env.DB, shareId)
    await c.env.DB.prepare('INSERT INTO removal_requests (gift_id, share_id, contact, relation, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .bind(gift?.id ?? null, shareId, contact, relation, detail || null, now)
      .run()
    await event(c, 'removal_requested')
    // Held back at once; an operator restores it if the request does not stand.
    if (gift && live(gift, now) && (await hideGift(c.env.DB, gift.id, 'removal_request', now))) await event(c, 'gift_hidden', { by: 'removal' })
    // The same answer whether or not the id exists.
    return c.html(legalPage('removal', c.env.SUPPORT_EMAIL, 'sent'), 200, legalHeaders())
  })

  app.route('/admin', adminRoutes())

  // F3-08: the player page with an absolute og:image, so chat apps can fetch the generic preview.
  app.get('/g/*', async (c) => {
    if (!c.env.ASSETS) return fail(c, 404, 'not_found')
    const res = await c.env.ASSETS.fetch(c.req.raw)
    const origin = configuredOrigin(c.env)
    if (!origin || !(res.headers.get('content-type') ?? '').includes('text/html')) return res
    const html = (await res.text()).replace('content="/og.png"', `content="${origin}/og.png"`)
    const headers = new Headers(res.headers)
    headers.delete('content-length')
    headers.set('X-Robots-Tag', 'noindex, nofollow')
    return new Response(html, { status: res.status, headers })
  })

  // Everything else is the player bundle.
  app.all('*', async (c) => {
    if (!c.env.ASSETS) return fail(c, 404, 'not_found')
    return c.env.ASSETS.fetch(c.req.raw)
  })

  return app
}

function revokeHeaders(): Record<string, string> {
  return {
    'X-Robots-Tag': 'noindex, nofollow',
    'Cache-Control': 'no-store',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'",
  }
}
