import { catalogIndex, templateById } from '@gfy/catalog'
import { MAX_EDGE, isJpeg, readJpegInfo, stripJpegMetadata } from '@gfy/imaging'
import { checkEgiftUrl, LIMITS, parseRevealJson, parseShareJson, SHARE_TTL_DAYS, textLength, type RevealJson, type ShareJson } from '@gfy/schema'
import { Hono, type Context } from 'hono'
import { cors } from 'hono/cors'
import {
  hashPassphrase,
  newGiftId,
  newRevokeCode,
  newShareId,
  normalizeRevokeCode,
  sha256Hex,
  timingSafeEqual,
  validDeviceKey,
  verifyPassphrase,
} from './crypto'
import type { Env } from './env'
import { revokePage } from './revoke-page'
import { createServices, ServiceConfigError, type Services } from './services'
import { deleteDraft, endGift, giftById, giftByShareId, live, photoKey, photosOf, takeAttempt, type GiftRow } from './store'

type AppEnv = { Bindings: Env; Variables: { services: Services; deviceId: string } }
type Ctx = Context<AppEnv>

export const PHOTO_MAX_BYTES = 1_500_000
const CONTENT_MAX_BYTES = 64_000
const EVENT_MAX_BYTES = 2048
const DRAFTS_PER_DAY = 20
const DAY_MS = 24 * 3600_000
const UNLOCK_TRIES = { max: 5, windowMs: 10 * 60_000 }
const REVOKE_TRIES = { max: 10, windowMs: 3600_000 }
const PHOTO_REF = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const SHARE_ID = /^[0-9A-Za-z]{10}$/

export type AppOptions = { now?: () => number }

/** Share and revoke links point here. Unset means links would lead nowhere, so publishing fails closed. */
function publicOrigin(env: Env): string {
  const origin = configuredOrigin(env)
  if (!origin) throw new ServiceConfigError('PUBLIC_ORIGIN is not set')
  return origin
}

function configuredOrigin(env: Env): string | null {
  const origin = (env.PUBLIC_ORIGIN ?? '').replace(/\/$/, '')
  return /^https?:\/\/[^/]+$/.test(origin) ? origin : null
}

const json = (c: Ctx, status: number, body: unknown) => c.json(body as object, status as 200)
const fail = (c: Ctx, status: number, error: string, extra: Record<string, unknown> = {}) => json(c, status, { error, ...extra })

/** Reads at most `max` bytes; null when the body is larger. */
async function readLimited(c: Ctx, max: number): Promise<Uint8Array | null> {
  const declared = Number(c.req.header('content-length') ?? '0')
  if (declared > max) return null
  const body = new Uint8Array(await c.req.arrayBuffer())
  return body.length > max ? null : body
}

async function readJson(c: Ctx, max: number): Promise<unknown | undefined> {
  const body = await readLimited(c, max)
  if (!body) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    return undefined
  }
}

function noindex(c: Ctx) {
  c.header('X-Robots-Tag', 'noindex, nofollow')
  c.header('Cache-Control', 'no-store')
}

async function ownedGift(c: Ctx): Promise<GiftRow | null> {
  const gift = await giftById(c.env.DB, c.req.param('giftId') ?? '')
  return gift && gift.device_id === c.get('deviceId') ? gift : null
}

type Content = { share: ShareJson; reveal: RevealJson; passphrase: string | null }

type ContentCheck = { ok: true; value: Content } | { ok: false; status: number; error: string; issues?: string[] }

/** Applies the server's rules on top of the Share/Reveal parsers. */
async function checkContent(input: unknown, services: Services): Promise<ContentCheck> {
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
      const check = checkEgiftUrl(r.egift.url)
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

async function notifyOnce(c: Ctx, gift: GiftRow, type: 'opened' | 'goal_reached') {
  const services = c.get('services')
  const db = c.env.DB
  const inserted = await db
    .prepare('INSERT OR IGNORE INTO notifications (gift_id, type, created_at) VALUES (?, ?, ?)')
    .bind(gift.id, type, services.now())
    .run()
  if (inserted.meta.changes !== 1) return
  const device = await db.prepare('SELECT push_token FROM devices WHERE id = ?').bind(gift.device_id).first<{ push_token: string | null }>()
  if (!device?.push_token) return
  const name = gift.to_name ?? ''
  const body = type === 'opened' ? `${name}さんがギフトを開きました` : `${name}さんがゴールにたどりつきました`
  try {
    await services.notifier.send({ token: device.push_token, title: 'gift-for-you', body, data: { giftId: gift.id, type } })
  } catch {
    // A failed push is not retried; the beacon itself already counted.
  }
}

export function createApp(options: AppOptions = {}) {
  const app = new Hono<AppEnv>()

  app.onError((err, c) => {
    if (err instanceof ServiceConfigError) return fail(c, 503, 'not_configured')
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
    c.set('deviceId', deviceId)
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

  app.post('/api/gifts', async (c) => {
    const now = c.get('services').now()
    const recent = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM gifts WHERE device_id = ? AND created_at > ?')
      .bind(c.get('deviceId'), now - DAY_MS)
      .first<{ n: number }>()
    if ((recent?.n ?? 0) >= DRAFTS_PER_DAY) return fail(c, 429, 'too_many_gifts')
    const id = newGiftId()
    await c.env.DB.prepare("INSERT INTO gifts (id, device_id, status, created_at) VALUES (?, ?, 'draft', ?)").bind(id, c.get('deviceId'), now).run()
    return json(c, 201, { giftId: id })
  })

  app.get('/api/gifts', async (c) => {
    const now = c.get('services').now()
    const { results } = await c.env.DB.prepare(
      `SELECT id, status, share_id, to_name, created_at, published_at, expires_at, ended_at, opened_at, goal_at,
       opened_count, goal_count FROM gifts WHERE device_id = ? AND status != 'draft' ORDER BY created_at DESC LIMIT 100`,
    )
      .bind(c.get('deviceId'))
      .all<GiftRow>()
    // Listing never fails on a missing origin; rows just carry no link.
    const origin = configuredOrigin(c.env)
    return json(c, 200, {
      gifts: results.map((gift) => {
        const status = gift.status === 'published' && (gift.expires_at ?? 0) <= now ? 'expired' : gift.status
        return {
          giftId: gift.id,
          status,
          shareId: gift.share_id,
          url: status === 'published' && gift.share_id && origin ? `${origin}/g/${gift.share_id}` : null,
          toName: gift.to_name,
          createdAt: gift.created_at,
          publishedAt: gift.published_at,
          expiresAt: gift.expires_at,
          endedAt: gift.ended_at,
          openedAt: gift.opened_at,
          goalAt: gift.goal_at,
          openedCount: gift.opened_count,
          goalCount: gift.goal_count,
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
    const verdict = await c.get('services').moderator.image(bytes)
    const now = c.get('services').now()
    if (verdict.ok) {
      await c.env.PHOTOS.put(photoKey(gift.id, ref), bytes, { httpMetadata: { contentType: 'image/jpeg' } })
    } else {
      // A rejected image is not kept.
      await c.env.PHOTOS.delete(photoKey(gift.id, ref))
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
    const checked = await checkContent(body, c.get('services'))
    if (!checked.ok) return fail(c, checked.status, checked.error, checked.issues ? { issues: checked.issues } : {})
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

  app.post('/api/gifts/:giftId/purchase', async (c) => {
    const gift = await ownedGift(c)
    if (!gift) return fail(c, 404, 'not_found')
    if (gift.status !== 'draft') return fail(c, 409, 'not_draft')
    if (gift.purchase_tx) return json(c, 200, { ok: true })
    const body = (await readJson(c, 4096)) as { platform?: unknown; transactionId?: unknown } | undefined
    const result = await c.get('services').purchases.verify({
      platform: String(body?.platform ?? ''),
      transactionId: String(body?.transactionId ?? ''),
    })
    if (!result.ok) return fail(c, 402, 'purchase_invalid', { reason: result.reason })
    const used = await c.env.DB.prepare('SELECT id FROM gifts WHERE purchase_tx = ?').bind(result.transactionId).first()
    if (used) return fail(c, 409, 'purchase_used')
    await c.env.DB.prepare('UPDATE gifts SET purchase_tx = ? WHERE id = ?').bind(result.transactionId, gift.id).run()
    return json(c, 200, { ok: true })
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
    const expiresAt = now + SHARE_TTL_DAYS * DAY_MS
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
        return json(c, 201, {
          shareId,
          url: `${origin}/g/${shareId}`,
          expiresAt: published.expiresAt,
          revokeCode,
          revokeUrl: `${origin}/r/${shareId}`,
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
    else if (gift.status === 'published') await endGift(c.env.DB, c.env.PHOTOS, gift, 'revoked', now)
    return c.body(null, 204)
  })

  // Public routes the player calls. Unknown, revoked, and expired gifts all answer the same 404.
  app.use('/s/*', async (c, next) => {
    await next()
    noindex(c)
  })

  const liveGift = async (c: Ctx): Promise<GiftRow | null> => {
    const shareId = c.req.param('shareId') ?? ''
    if (!SHARE_ID.test(shareId)) return null
    const gift = await giftByShareId(c.env.DB, shareId)
    return live(gift, c.get('services').now()) ? gift : null
  }

  app.get('/s/:shareId/share', async (c) => {
    const gift = await liveGift(c)
    if (!gift?.share_json) return fail(c, 404, 'not_found')
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
    if (type !== 'opened' && type !== 'goal_reached') return c.body(null, 204)
    const gift = await liveGift(c)
    if (!gift) return c.body(null, 204)
    const now = c.get('services').now()
    if (type === 'opened') {
      await c.env.DB.prepare('UPDATE gifts SET opened_count = opened_count + 1, opened_at = COALESCE(opened_at, ?) WHERE id = ?').bind(now, gift.id).run()
    } else {
      await c.env.DB.prepare('UPDATE gifts SET goal_count = goal_count + 1, goal_at = COALESCE(goal_at, ?) WHERE id = ?').bind(now, gift.id).run()
    }
    await notifyOnce(c, gift, type)
    return c.body(null, 204)
  })

  app.get('/s/:shareId/reveal', async (c) => {
    const gift = await liveGift(c)
    if (!gift?.reveal_json) return fail(c, 404, 'not_found')
    // The letter waits for a goal_reached beacon, as in Phase 1.
    if (gift.goal_at === null) return fail(c, 403, 'not_ready')
    const reveal = JSON.parse(gift.reveal_json) as RevealJson
    if (reveal.egift && gift.passphrase_hash) reveal.egift = { kind: reveal.egift.kind, locked: true }
    return json(c, 200, reveal)
  })

  app.post('/s/:shareId/unlock', async (c) => {
    const gift = await liveGift(c)
    if (!gift?.reveal_json || gift.goal_at === null) return fail(c, 404, 'not_found')
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
    await endGift(c.env.DB, c.env.PHOTOS, gift, 'revoked', now)
    return c.html(revokePage({ state: 'done' }), 200, revokeHeaders())
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
