import { makeTestJpeg } from '@gfy/imaging/testing'
import { describe, expect, it } from 'vitest'
import { ModerationUnavailable, VisionModerator, WordListModerator } from '../src/services/moderation'
import { ExpoNotifier } from '../src/services/notify'
import { PurchaseUnavailable, RevenueCatVerifier } from '../src/services/purchase'
import { OidcSignInVerifier } from '../src/services/signin'
import { sha256Hex } from '../src/crypto'
import { claimPurchase, sweep } from '../src/store'
import { deviceKey, setup } from './harness'

const DAY = 24 * 3600_000
const ADMIN_TOKEN = 'test-admin-token-0123456789abcdefghij'

type Ctx = ReturnType<typeof setup>

function share(refs: string[], templateId = 'course-01') {
  return {
    schemaVersion: 1,
    mode: 'platformer',
    catalogVersion: '2026.10.1',
    locale: 'ja',
    from: { displayName: '健太' },
    to: { displayName: '彩' },
    course: { templateId, difficulty: 'easy', obstaclePresets: ['preset-easy'], assist: { autoAssistAfterFails: 3, easyModeDefault: false } },
    memoryCoins: refs.map((ref, i) => ({ order: i + 1, photoRef: ref, message: `思い出${i + 1}` })),
    goal: {
      revealEffectId: 'reveal-01',
      giftItem: { itemId: 'teddy', label: 'くま' },
      letter: { present: true },
      egift: { present: true, kind: 'url' },
    },
  }
}

const reveal = (url = 'https://giftee.com/cards/abc') => ({ letter: { body: 'ありがとう' }, egift: { kind: 'url', url } })

const post = (ctx: Ctx, path: string, body: unknown, init: { key?: string; headers?: Record<string, string> } = {}) =>
  ctx.request(path, { method: 'POST', key: init.key, headers: { 'content-type': 'application/json', ...init.headers }, body: JSON.stringify(body) })

async function draftWithContent(ctx: Ctx, key: string, options: { templateId?: string; refs?: string[]; url?: string } = {}) {
  const giftId = ((await (await ctx.request('/api/gifts', { method: 'POST', key })).json()) as { giftId: string }).giftId
  const refs = options.refs ?? ['p-1', 'p-2']
  for (const ref of refs) {
    const res = await ctx.request(`/api/gifts/${giftId}/photos/${ref}`, { method: 'PUT', key, headers: { 'content-type': 'image/jpeg' }, body: makeTestJpeg() })
    expect(res.status).toBe(200)
  }
  const res = await ctx.request(`/api/gifts/${giftId}/content`, {
    method: 'PUT',
    key,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ share: share(refs, options.templateId), reveal: reveal(options.url) }),
  })
  expect(res.status, await res.clone().text()).toBe(200)
  return giftId
}

async function buyAndPublish(ctx: Ctx, key: string, giftId: string, productId = 'gfy_gift_standard', transactionId = `sandbox-${crypto.randomUUID()}`) {
  const bought = await post(ctx, `/api/gifts/${giftId}/purchase`, { platform: 'sandbox', transactionId, productId }, { key })
  expect(bought.status, await bought.clone().text()).toBe(200)
  const res = await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })
  expect(res.status).toBe(201)
  return (await res.json()) as { shareId: string; expiresAt: string; tier: string }
}

async function publish(ctx: Ctx, key = deviceKey(), options: { templateId?: string; productId?: string } = {}) {
  const giftId = await draftWithContent(ctx, key, options)
  return { key, giftId, ...(await buyAndPublish(ctx, key, giftId, options.productId)) }
}

async function events(ctx: Ctx) {
  const { results } = await ctx.env.DB.prepare('SELECT name, props FROM analytics_events ORDER BY id').all<{ name: string; props: string | null }>()
  return results
}

describe('F3-03 purchases', () => {
  it('sells two tiers: ¥480 opens 14 days, ¥980 opens 30 days', async () => {
    const ctx = setup()
    const standard = await publish(ctx)
    expect(standard.tier).toBe('standard')
    expect(Date.parse(standard.expiresAt) - ctx.clock.now).toBe(14 * DAY)
    const premium = await publish(ctx, deviceKey(), { productId: 'gfy_gift_premium' })
    expect(premium.tier).toBe('premium')
    expect(Date.parse(premium.expiresAt) - ctx.clock.now).toBe(30 * DAY)
    const owner = deviceKey()
    const bad = await draftWithContent(ctx, owner)
    const unknown = await post(ctx, `/api/gifts/${bad}/purchase`, { platform: 'sandbox', transactionId: 'sandbox-12345678', productId: 'gfy_other' }, { key: owner })
    expect(await unknown.json()).toEqual({ error: 'purchase_invalid', reason: 'product' })
  })

  it('never spends one transaction twice, even from another device', async () => {
    const ctx = setup()
    const key = deviceKey()
    const tx = `sandbox-${crypto.randomUUID()}`
    const first = await draftWithContent(ctx, key)
    await buyAndPublish(ctx, key, first, 'gfy_gift_standard', tx)
    const second = await draftWithContent(ctx, key)
    expect((await post(ctx, `/api/gifts/${second}/purchase`, { platform: 'sandbox', transactionId: tx }, { key })).status).toBe(409)
    const other = deviceKey()
    const third = await draftWithContent(ctx, other)
    expect((await post(ctx, `/api/gifts/${third}/purchase`, { platform: 'sandbox', transactionId: tx }, { key: other })).status).toBe(409)
  })

  it('records webhook purchases as credits the device can spend later, once, and marks refunds', async () => {
    const ctx = setup({ REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret' })
    const key = deviceKey()
    const deviceId = await sha256Hex(key)
    const hook = (event: Record<string, unknown>, auth = 'Bearer hook-secret') => post(ctx, '/webhooks/revenuecat', { event }, { headers: { authorization: auth } })
    const purchase = { id: 'ev-1', type: 'NON_RENEWING_PURCHASE', app_user_id: `gfy_${deviceId}`, product_id: 'gfy_gift_premium', transaction_id: '2000000123', store: 'APP_STORE', environment: 'PRODUCTION', purchased_at_ms: ctx.clock.now }
    expect((await hook(purchase, 'Bearer wrong')).status).toBe(401)
    expect((await hook(purchase)).status).toBe(200)
    expect(await (await hook(purchase)).json()).toEqual({ ok: true, duplicate: true })

    const unclaimed = await (await ctx.request('/api/purchases/unclaimed', { key })).json()
    expect(unclaimed).toEqual({ purchases: [{ transactionId: '2000000123', productId: 'gfy_gift_premium', tier: 'premium' }] })
    // The pending transaction is replayed against a gift without asking RevenueCat again (PURCHASE is the sandbox mock here).
    const giftId = await draftWithContent(ctx, key)
    const claimed = await post(ctx, `/api/gifts/${giftId}/purchase`, { platform: 'ios', transactionId: '2000000123', productId: 'gfy_gift_premium' }, { key })
    expect(await claimed.json()).toEqual({ ok: true, tier: 'premium' })
    expect(await (await ctx.request('/api/purchases/unclaimed', { key })).json()).toEqual({ purchases: [] })
    // Another device cannot take it.
    const thief = deviceKey()
    const theirs = await draftWithContent(ctx, thief)
    expect((await post(ctx, `/api/gifts/${theirs}/purchase`, { platform: 'ios', transactionId: '2000000123' }, { key: thief })).status).toBe(402)

    await hook({ id: 'ev-2', type: 'NON_RENEWING_PURCHASE', app_user_id: `gfy_${deviceId}`, product_id: 'gfy_gift_standard', transaction_id: '2000000999', environment: 'PRODUCTION' })
    await hook({ id: 'ev-3', type: 'CANCELLATION', app_user_id: `gfy_${deviceId}`, product_id: 'gfy_gift_standard', transaction_id: '2000000999' })
    expect(await (await ctx.request('/api/purchases/unclaimed', { key })).json()).toEqual({ purchases: [] })
    expect((await hook({ id: 'ev-4' })).status).toBe(400)
  })

  it('turns an unfinished store transaction into a credit that a later gift spends', async () => {
    const ctx = setup()
    const key = deviceKey()
    const synced = await post(ctx, '/api/purchases', { platform: 'sandbox', transactionId: 'sandbox-orphan-0001', productId: 'gfy_gift_premium' }, { key })
    expect(await synced.json()).toEqual({ transactionId: 'sandbox:sandbox-orphan-0001', tier: 'premium', claimed: false })
    const unclaimed = (await (await ctx.request('/api/purchases/unclaimed', { key })).json()) as { purchases: { transactionId: string }[] }
    expect(unclaimed.purchases.map((p) => p.transactionId)).toEqual(['sandbox:sandbox-orphan-0001'])
    const giftId = await draftWithContent(ctx, key)
    const spent = await post(ctx, `/api/gifts/${giftId}/purchase`, { platform: 'credit', transactionId: 'sandbox:sandbox-orphan-0001' }, { key })
    expect(await spent.json()).toEqual({ ok: true, tier: 'premium' })
    expect(await (await post(ctx, '/api/purchases', { platform: 'sandbox', transactionId: 'sandbox:sandbox-orphan-0001' }, { key })).json()).toMatchObject({ claimed: true })
    expect((await post(ctx, '/api/purchases', { platform: 'sandbox', transactionId: 'sandbox:sandbox-orphan-0001' }, { key: deviceKey() })).status).toBe(409)
  })

  it('finishes a claim that stopped half way when the app retries', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draftWithContent(ctx, key)
    const tx = `sandbox-${crypto.randomUUID()}`
    // The purchase row says this gift, the gift has no purchase: what a crash between the two writes used to leave.
    await post(ctx, '/api/purchases', { platform: 'sandbox', transactionId: tx }, { key })
    await ctx.env.DB.prepare('UPDATE purchases SET gift_id = ? WHERE transaction_id = ?').bind(giftId, `sandbox:${tx}`).run()
    const retry = await post(ctx, `/api/gifts/${giftId}/purchase`, { platform: 'sandbox', transactionId: tx }, { key })
    expect(await retry.json()).toEqual({ ok: true, tier: 'standard' })
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(201)
  })

  it('keeps a second transaction racing for the same gift as a credit', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draftWithContent(ctx, key)
    for (const tx of ['sandbox-race-0001', 'sandbox-race-0002']) await post(ctx, '/api/purchases', { platform: 'sandbox', transactionId: tx }, { key })
    // Both requests read the gift before either wrote: each goes on to claim.
    expect(await claimPurchase(ctx.env.DB, giftId, 'sandbox:sandbox-race-0001', 'standard')).toBe(true)
    expect(await claimPurchase(ctx.env.DB, giftId, 'sandbox:sandbox-race-0002', 'standard')).toBe(false)
    // A retry of the winner still succeeds.
    expect(await claimPurchase(ctx.env.DB, giftId, 'sandbox:sandbox-race-0001', 'standard')).toBe(true)
    const gift = await ctx.env.DB.prepare('SELECT purchase_tx FROM gifts WHERE id = ?').bind(giftId).first()
    expect(gift).toEqual({ purchase_tx: 'sandbox:sandbox-race-0001' })
    const unclaimed = (await (await ctx.request('/api/purchases/unclaimed', { key })).json()) as { purchases: { transactionId: string }[] }
    expect(unclaimed.purchases.map((p) => p.transactionId)).toEqual(['sandbox:sandbox-race-0002'])
  })

  it('answers 503 for the webhook until its secret is set', async () => {
    const ctx = setup()
    expect((await post(ctx, '/webhooks/revenuecat', { event: { id: 'x', type: 'TEST' } })).status).toBe(503)
  })

  it('verifies a transaction with RevenueCat for that app user and product', async () => {
    const calls: string[] = []
    const answer = (status: number, body: unknown) => async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push(`${String(url)} ${new Headers(init?.headers).get('authorization')}`)
      return new Response(JSON.stringify(body), { status })
    }
    const subscriber = {
      subscriber: {
        non_subscriptions: {
          gfy_gift_standard: [{ id: 'rc1', store_transaction_id: '1000', store: 'app_store', is_sandbox: false, purchase_date: '2026-10-16T00:00:00Z' }],
          gfy_gift_premium: [{ id: 'rc2', store_transaction_id: 'GPA.1', store: 'play_store', is_sandbox: true }],
        },
      },
    }
    const verifier = new RevenueCatVerifier('sk_test', false, answer(200, subscriber) as typeof fetch)
    expect(await verifier.verify({ platform: 'ios', transactionId: '1000', productId: 'gfy_gift_standard' }, 'gfy_dev')).toMatchObject({
      ok: true,
      transactionId: '1000',
      productId: 'gfy_gift_standard',
      appUserId: 'gfy_dev',
      isSandbox: false,
    })
    expect(calls[0]).toBe('https://api.revenuecat.com/v1/subscribers/gfy_dev Bearer sk_test')
    expect(await verifier.verify({ platform: 'ios', transactionId: '1000', productId: 'gfy_gift_premium' }, 'gfy_dev')).toEqual({ ok: false, reason: 'receipt' })
    expect(await verifier.verify({ platform: 'android', transactionId: 'GPA.1', productId: 'gfy_gift_premium' }, 'gfy_dev')).toEqual({ ok: false, reason: 'sandbox' })
    const sandboxOk = new RevenueCatVerifier('sk_test', true, answer(200, subscriber) as typeof fetch)
    expect(await sandboxOk.verify({ platform: 'android', transactionId: 'GPA.1', productId: 'gfy_gift_premium' }, 'gfy_dev')).toMatchObject({ ok: true, isSandbox: true })
    expect(await verifier.verify({ platform: 'sandbox', transactionId: '1000', productId: 'gfy_gift_standard' }, 'gfy_dev')).toEqual({ ok: false, reason: 'platform' })
    await expect(new RevenueCatVerifier('sk_test', false, answer(500, {}) as typeof fetch).verify({ platform: 'ios', transactionId: '1000', productId: 'gfy_gift_standard' }, 'gfy_dev')).rejects.toBeInstanceOf(PurchaseUnavailable)
    expect(() => new RevenueCatVerifier('', false)).toThrow(PurchaseUnavailable)
  })

  it('fails closed with 503 when RevenueCat is selected but has no key', async () => {
    const ctx = setup({ PURCHASE: 'revenuecat' })
    const key = deviceKey()
    const giftId = await draftWithContent(ctx, key)
    const res = await post(ctx, `/api/gifts/${giftId}/purchase`, { platform: 'ios', transactionId: '1000', productId: 'gfy_gift_standard' }, { key })
    expect(res.status).toBe(503)
  })
})

describe('F3-04 moderation', () => {
  const vision = (annotation: unknown, status = 200) =>
    new VisionModerator('vision-key', (async (_url: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('vision-key')
      return new Response(JSON.stringify({ responses: [annotation] }), { status })
    }) as typeof fetch)

  it('rejects photos SafeSearch rates as adult, violent, or racy, and fails closed on errors', async () => {
    const jpeg = makeTestJpeg()
    expect(await vision({ safeSearchAnnotation: { adult: 'VERY_UNLIKELY', violence: 'UNLIKELY', racy: 'POSSIBLE' } }).image(jpeg)).toEqual({ ok: true })
    expect(await vision({ safeSearchAnnotation: { adult: 'POSSIBLE', violence: 'VERY_UNLIKELY', racy: 'UNLIKELY' } }).image(jpeg)).toEqual({ ok: false, reason: 'adult' })
    expect(await vision({ safeSearchAnnotation: { adult: 'UNLIKELY', violence: 'VERY_LIKELY', racy: 'UNLIKELY' } }).image(jpeg)).toEqual({ ok: false, reason: 'violence' })
    expect(await vision({ safeSearchAnnotation: { adult: 'UNLIKELY', violence: 'UNLIKELY', racy: 'LIKELY' } }).image(jpeg)).toEqual({ ok: false, reason: 'racy' })
    await expect(vision({ error: { code: 3 } }).image(jpeg)).rejects.toBeInstanceOf(ModerationUnavailable)
    await expect(vision({}, 429).image(jpeg)).rejects.toBeInstanceOf(ModerationUnavailable)
  })

  it('checks text against the word list, ignoring width and spaces', async () => {
    const words = new WordListModerator()
    expect(await words.text('いつもありがとう')).toEqual({ ok: true })
    expect(await words.text('し ね')).toEqual({ ok: false, reason: 'blocked_word' })
    expect(await words.text('ＮＧＷＯＲＤ')).toEqual({ ok: false, reason: 'blocked_word' })
  })

  it('does not store a photo when the moderation service is down', async () => {
    const ctx = setup({ MODERATION: 'vision', GOOGLE_VISION_API_KEY: '' })
    const key = deviceKey()
    const giftId = ((await (await ctx.request('/api/gifts', { method: 'POST', key })).json()) as { giftId: string }).giftId
    const res = await ctx.request(`/api/gifts/${giftId}/photos/p-1`, { method: 'PUT', key, headers: { 'content-type': 'image/jpeg' }, body: makeTestJpeg() })
    expect(res.status).toBe(503)
    expect(ctx.bucket.objects.size).toBe(0)
  })
})

describe('F3-05 reports and removal requests', () => {
  const report = (ctx: Ctx, shareId: string, ip: string, reason = 'inappropriate') =>
    post(ctx, `/s/${shareId}/report`, { reason, detail: 'いやな写真' }, { headers: { 'cf-connecting-ip': ip } })

  it('hides a gift once three different people report it, and the sender sees it as hidden', async () => {
    const ctx = setup()
    const { key, shareId } = await publish(ctx)
    expect((await report(ctx, shareId, '198.51.100.1', 'nonsense')).status).toBe(400)
    expect((await report(ctx, shareId, '198.51.100.1')).status).toBe(202)
    expect((await report(ctx, shareId, '198.51.100.1')).status).toBe(202)
    expect((await report(ctx, shareId, '198.51.100.2', 'harassment')).status).toBe(202)
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(200)
    expect((await report(ctx, shareId, '198.51.100.3', 'scam')).status).toBe(202)
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(404)
    expect((await ctx.request(`/s/${shareId}/photos/p-1`)).status).toBe(404)
    const list = (await (await ctx.request('/api/gifts', { key })).json()) as { gifts: { status: string }[] }
    expect(list.gifts[0].status).toBe('hidden')
    // Reporter IPs are only kept as salted hashes.
    const { results } = await ctx.env.DB.prepare('SELECT reporter_hash FROM reports').all<{ reporter_hash: string }>()
    expect(results).toHaveLength(3)
    for (const row of results) expect(row.reporter_hash).toMatch(/^[0-9a-f]{64}$/)
    expect((await events(ctx)).filter((e) => e.name === 'gift_hidden')).toHaveLength(1)
  })

  it('limits how many reports one address can send', async () => {
    const ctx = setup({ REPORT_HIDE_THRESHOLD: '100' })
    const ids = []
    for (let i = 0; i < 11; i += 1) ids.push((await publish(ctx)).shareId)
    const codes = []
    for (const id of ids) codes.push((await report(ctx, id, '203.0.113.9')).status)
    expect(codes.slice(0, 10).every((code) => code === 202)).toBe(true)
    expect(codes[10]).toBe(429)
  })

  it('takes a removal request from the person in the photo and hides the gift at once', async () => {
    const ctx = setup()
    const { shareId } = await publish(ctx)
    const form = (fields: Record<string, string>) =>
      ctx.request('/legal/removal', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })
    expect((await form({ url: 'nope', contact: 'a@b.example', relation: 'self' })).status).toBe(422)
    const sent = await form({ url: `https://gift.example/g/${shareId}`, contact: 'me@example.com', relation: 'self', detail: '私が写っています' })
    expect(sent.status).toBe(200)
    expect(await sent.text()).toContain('受け付けました')
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(404)
    const unknown = await form({ url: 'https://gift.example/g/AAAAAAAAAA', contact: 'me@example.com', relation: 'guardian' })
    expect(unknown.status).toBe(200)
    const { results } = await ctx.env.DB.prepare('SELECT share_id, relation FROM removal_requests ORDER BY id').all()
    expect(results).toEqual([
      { share_id: shareId, relation: 'self' },
      { share_id: 'AAAAAAAAAA', relation: 'guardian' },
    ])
  })

  it('serves draft terms, privacy, 特商法, support, and removal pages with the contact address', async () => {
    const ctx = setup({ SUPPORT_EMAIL: 'support@gift.example' })
    for (const path of ['/legal/terms', '/legal/privacy', '/legal/tokushoho', '/support', '/legal/removal']) {
      const res = await ctx.request(path)
      expect(res.status, path).toBe(200)
      const html = await res.text()
      expect(html).toContain('ドラフト')
      expect(res.headers.get('content-security-policy')).toContain("default-src 'none'")
      if (path !== '/legal/removal') expect(html, path).toContain('support@gift.example')
    }
    expect(await (await ctx.request('/legal/tokushoho')).text()).toContain('【事業者名】')
  })
})

describe('F3-06 expiry and deletion', () => {
  it('ends gifts at expiry and purges what is left 30 days later', async () => {
    const ctx = setup()
    const { giftId, shareId } = await publish(ctx)
    ctx.clock.now += 14 * DAY
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(404)
    expect(await sweep(ctx.env.DB, ctx.env.PHOTOS, ctx.clock.now, 2 * DAY)).toMatchObject({ expired: 1 })
    expect(ctx.bucket.objects.size).toBe(0)
    const ended = await ctx.env.DB.prepare('SELECT status, ended_reason, share_json FROM gifts WHERE id = ?').bind(giftId).first()
    expect(ended).toEqual({ status: 'expired', ended_reason: 'expired', share_json: null })
    ctx.clock.now += 30 * DAY
    expect(await sweep(ctx.env.DB, ctx.env.PHOTOS, ctx.clock.now, 2 * DAY)).toMatchObject({ purged: 1 })
    expect(await ctx.env.DB.prepare('SELECT id FROM gifts WHERE id = ?').bind(giftId).first()).toBeNull()
    // The purchase stays for accounting, without the gift or the device.
    expect(await ctx.env.DB.prepare('SELECT gift_id, app_user_id FROM purchases').first()).toEqual({ gift_id: null, app_user_id: null })
  })
})

describe('F3-09 thanks', () => {
  it('lets the recipient send one stamp after the goal and pushes it to the sender once', async () => {
    const ctx = setup()
    const key = deviceKey()
    await ctx.request('/api/devices/push', { method: 'PUT', key, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'mock-token-1', platform: 'mock' }) })
    const { shareId } = await publish(ctx, key)
    expect((await post(ctx, `/s/${shareId}/thanks`, { stamp: 'thanks' })).status).toBe(404)
    await post(ctx, `/s/${shareId}/events`, { type: 'goal_reached' })
    expect((await post(ctx, `/s/${shareId}/thanks`, { stamp: 'bogus' })).status).toBe(400)
    expect(await (await post(ctx, `/s/${shareId}/thanks`, { stamp: 'love' })).json()).toEqual({ stamp: 'love' })
    expect(await (await post(ctx, `/s/${shareId}/thanks`, { stamp: 'thanks' })).json()).toEqual({ stamp: 'love' })
    const sent = ((await (await ctx.request('/api/_mock/push')).json()) as { sent: { body: string }[] }).sent.map((p) => p.body)
    expect(sent).toEqual(['彩さんがゴールにたどりつきました', '彩さんから「だいすき」が届きました'])
    const list = (await (await ctx.request('/api/gifts', { key })).json()) as { gifts: { thanks: string }[] }
    expect(list.gifts[0].thanks).toBe('love')
  })

  it('forgets a push token Expo says is gone', async () => {
    const reply = (data: unknown) => (async () => new Response(JSON.stringify({ data }), { status: 200 })) as unknown as typeof fetch
    const message = { token: 'ExponentPushToken[x]', title: 't', body: 'b', data: {} }
    expect(await new ExpoNotifier(undefined, reply({ status: 'ok', id: '1' })).send(message)).toBe('sent')
    expect(await new ExpoNotifier(undefined, reply({ status: 'error', details: { error: 'DeviceNotRegistered' } })).send(message)).toBe('gone')
    await expect(new ExpoNotifier(undefined, reply({ status: 'error', details: { error: 'MessageRateExceeded' } })).send(message)).rejects.toThrow()
  })
})

describe('F3-12 UGC, accounts, and deletion', () => {
  it('blocks a sender for one viewer across their gifts', async () => {
    const ctx = setup()
    const key = deviceKey()
    const first = await publish(ctx, key)
    const second = await publish(ctx, key)
    const other = await publish(ctx)
    const viewer = 'viewer-key-0123456789abcdef'
    expect((await post(ctx, `/s/${first.shareId}/block`, { viewer: 'x' })).status).toBe(400)
    expect((await post(ctx, `/s/${first.shareId}/block`, { viewer })).status).toBe(204)
    const as = (shareId: string, v: string) => ctx.request(`/s/${shareId}/share`, { headers: { 'x-gfy-viewer': v } })
    expect((await as(second.shareId, viewer)).status).toBe(403)
    expect(await (await as(second.shareId, viewer)).json()).toEqual({ error: 'blocked' })
    expect((await as(other.shareId, viewer)).status).toBe(200)
    expect((await as(second.shareId, 'someone-else-0123456789ab')).status).toBe(200)
    const { results } = await ctx.env.DB.prepare('SELECT viewer_hash FROM blocks').all<{ viewer_hash: string }>()
    expect(results[0].viewer_hash).not.toContain(viewer)
  })

  it('keeps a block after the sender signs in, and holds back the letter and e-gift too', async () => {
    const ctx = setup({ SIGNIN: 'mock' })
    const key = deviceKey()
    const first = await publish(ctx, key)
    const viewer = 'viewer-key-abcdefghijklmnop'
    await post(ctx, `/s/${first.shareId}/block`, { viewer })
    await post(ctx, '/api/account/link', { provider: 'mock', idToken: 'mock:sender-1' }, { key })
    const second = await publish(ctx, key)
    const as = { 'x-gfy-viewer': viewer }
    expect((await ctx.request(`/s/${second.shareId}/share`, { headers: as })).status).toBe(403)
    // A new device on the same account is covered once a block is made after the link.
    await post(ctx, `/s/${second.shareId}/block`, { viewer })
    const tablet = deviceKey()
    await post(ctx, '/api/account/link', { provider: 'mock', idToken: 'mock:sender-1' }, { key: tablet })
    const third = await publish(ctx, tablet)
    expect((await ctx.request(`/s/${third.shareId}/share`, { headers: as })).status).toBe(403)
    await post(ctx, `/s/${third.shareId}/events`, { type: 'goal_reached' })
    expect((await ctx.request(`/s/${third.shareId}/reveal`, { headers: as })).status).toBe(403)
    expect((await post(ctx, `/s/${third.shareId}/unlock`, { passphrase: 'x' }, { headers: as })).status).toBe(403)
    expect((await ctx.request(`/s/${third.shareId}/reveal`)).status).toBe(200)
  })

  it('links two devices with one sign-in, then deletes the account with every gift, photo, and key', async () => {
    const ctx = setup({ SIGNIN: 'mock' })
    const phone = deviceKey()
    const tablet = deviceKey()
    const a = await publish(ctx, phone)
    const b = await publish(ctx, tablet)
    await draftWithContent(ctx, phone)
    expect((await post(ctx, '/api/account/link', { provider: 'mock', idToken: 'nope' }, { key: phone })).status).toBe(401)
    expect(await (await post(ctx, '/api/account/link', { provider: 'mock', idToken: 'mock:user-1' }, { key: phone })).json()).toEqual({ linked: true, provider: 'mock' })
    await post(ctx, '/api/account/link', { provider: 'mock', idToken: 'mock:user-1' }, { key: tablet })
    expect(await (await ctx.request('/api/account', { key: tablet })).json()).toEqual({ linked: ['mock'] })
    const list = (await (await ctx.request('/api/gifts', { key: tablet })).json()) as { gifts: { shareId: string }[] }
    expect(list.gifts.map((gift) => gift.shareId).sort()).toEqual([a.shareId, b.shareId].sort())
    // A linked device can revoke the other device's gift.
    expect((await ctx.request(`/api/gifts/${a.giftId}`, { method: 'DELETE', key: tablet })).status).toBe(204)

    expect((await ctx.request('/api/account', { method: 'DELETE', key: phone })).status).toBe(204)
    expect((await ctx.request(`/s/${b.shareId}/share`)).status).toBe(404)
    expect(ctx.bucket.objects.size).toBe(0)
    for (const table of ['gifts', 'devices', 'accounts', 'account_links', 'photos']) {
      const row = await ctx.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>()
      expect(row?.n, table).toBe(0)
    }
    expect((await events(ctx)).some((e) => e.name === 'account_deleted')).toBe(true)
  })

  it('verifies Apple and Google ID tokens against their keys, issuer, audience, and expiry', async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )) as CryptoKeyPair
    const jwk = { ...((await crypto.subtle.exportKey('jwk', pair.publicKey)) as JsonWebKey), kid: 'k1' }
    const b64 = (value: string | Uint8Array) => Buffer.from(value).toString('base64url')
    const sign = async (claims: Record<string, unknown>) => {
      const head = b64(JSON.stringify({ alg: 'RS256', kid: 'k1' }))
      const body = b64(JSON.stringify(claims))
      const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', pair.privateKey, new TextEncoder().encode(`${head}.${body}`)))
      return `${head}.${body}.${b64(sig)}`
    }
    const now = Date.parse('2026-10-16T00:00:00Z')
    const fetchKeys = (async (url: RequestInfo | URL) => {
      expect(String(url)).toBe('https://appleid.apple.com/auth/keys')
      return new Response(JSON.stringify({ keys: [jwk] }))
    }) as typeof fetch
    const verifier = new OidcSignInVerifier({ apple: ['app.giftforyou.creator'], google: [] }, () => now, fetchKeys)
    const good = { iss: 'https://appleid.apple.com', aud: 'app.giftforyou.creator', sub: 'apple-sub', exp: now / 1000 + 600 }
    expect(await verifier.verify('apple', await sign(good))).toEqual({ ok: true, provider: 'apple', subject: 'apple-sub' })
    expect(await verifier.verify('apple', await sign({ ...good, aud: 'other' }))).toEqual({ ok: false, reason: 'audience' })
    expect(await verifier.verify('apple', await sign({ ...good, exp: now / 1000 - 1 }))).toEqual({ ok: false, reason: 'expired' })
    expect(await verifier.verify('apple', await sign({ ...good, iss: 'https://evil.example' }))).toEqual({ ok: false, reason: 'issuer' })
    const tampered = (await sign(good)).split('.')
    tampered[1] = b64(JSON.stringify({ ...good, sub: 'someone-else' }))
    expect(await verifier.verify('apple', tampered.join('.'))).toEqual({ ok: false, reason: 'signature' })
    expect(await verifier.verify('google', await sign(good))).toEqual({ ok: false, reason: 'provider' })
  })
})

describe('F3-07 analytics and admin', () => {
  it('records funnel events with no personal data and accepts only known client events', async () => {
    const ctx = setup()
    const key = deviceKey()
    expect((await post(ctx, '/api/analytics', { name: 'create_started', props: { template: 'course-02', note: 'Hello World!' } }, { key })).status).toBe(204)
    expect((await post(ctx, '/api/analytics', { name: 'gift_published' }, { key })).status).toBe(400)
    const { shareId } = await publish(ctx, key, { templateId: 'course-03' })
    await post(ctx, `/s/${shareId}/events`, { type: 'opened' })
    await post(ctx, `/s/${shareId}/events`, { type: 'opened' })
    const all = await events(ctx)
    expect(all.find((e) => e.name === 'create_started')?.props).toBe('{"template":"course-02"}')
    expect(all.find((e) => e.name === 'gift_published')?.props).toBe('{"tier":"standard","template":"course-03","difficulty":"easy","coins":2}')
    expect(all.filter((e) => e.name === 'gift_opened')).toHaveLength(1)
    // Each device can add at most 60 client events an hour.
    for (let i = 0; i < 65; i += 1) expect((await post(ctx, '/api/analytics', { name: 'preview_opened' }, { key })).status).toBe(204)
    const counted = await ctx.env.DB.prepare("SELECT COUNT(*) AS n FROM analytics_events WHERE name IN ('create_started', 'preview_opened')").first<{ n: number }>()
    expect(counted?.n).toBe(60)
    const dump = JSON.stringify(all)
    for (const secret of ['彩', '健太', shareId, 'giftee', 'p-1']) expect(dump).not.toContain(secret)
  })

  async function login(ctx: Ctx, token = ADMIN_TOKEN) {
    const res = await ctx.request('/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '192.0.2.1' },
      body: new URLSearchParams({ token }).toString(),
    })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    return { res, cookie }
  }

  async function csrfFrom(ctx: Ctx, cookie: string, path: string) {
    const html = await (await ctx.request(path, { headers: { cookie } })).text()
    return html.match(/name="csrf" value="([0-9a-f]+)"/)![1]
  }

  const form = (ctx: Ctx, cookie: string, path: string, fields: Record<string, string>) =>
    ctx.request(path, { method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() })

  it('stays closed without a token, rejects a wrong one, and needs the session and CSRF token', async () => {
    expect((await setup().request('/admin')).status).toBe(503)
    const ctx = setup({ ADMIN_TOKEN })
    expect((await ctx.request('/admin')).status).toBe(303)
    expect((await login(ctx, 'wrong')).res.status).toBe(403)
    const { res, cookie } = await login(ctx)
    expect(res.status).toBe(303)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/)
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=Strict/)
    const dash = await ctx.request('/admin', { headers: { cookie } })
    expect(dash.status).toBe(200)
    expect(await dash.text()).toContain('ダッシュボード')
    expect((await ctx.request('/admin', { headers: { cookie: `${cookie.split('.')[0]}.forged` } })).status).toBe(303)
    const { shareId } = await publish(ctx)
    expect((await form(ctx, cookie, `/admin/gifts/${shareId}/hide`, { csrf: 'nope' })).status).toBe(403)
    // Sessions end after eight hours.
    ctx.clock.now += 9 * 3600_000
    expect((await ctx.request('/admin', { headers: { cookie } })).status).toBe(303)
  })

  it('reviews reported gifts, hides, restores, and deletes them', async () => {
    const ctx = setup({ ADMIN_TOKEN, REPORT_HIDE_THRESHOLD: '1' })
    const { shareId } = await publish(ctx)
    await post(ctx, `/s/${shareId}/report`, { reason: 'inappropriate' }, { headers: { 'cf-connecting-ip': '198.51.100.7' } })
    const { cookie } = await login(ctx)
    const reports = await (await ctx.request('/admin/reports', { headers: { cookie } })).text()
    expect(reports).toContain(shareId)
    expect(reports).toContain('不適切な写真や言葉がある')
    const detail = await (await ctx.request(`/admin/gifts/${shareId}`, { headers: { cookie } })).text()
    expect(detail).toContain('非公開（reports）')
    expect(detail).toContain(`/admin/gifts/${shareId}/photos/p-1`)
    expect((await ctx.request(`/admin/gifts/${shareId}/photos/p-1`, { headers: { cookie } })).status).toBe(200)
    const csrf = await csrfFrom(ctx, cookie, `/admin/gifts/${shareId}`)
    expect((await form(ctx, cookie, `/admin/gifts/${shareId}/unhide`, { csrf })).status).toBe(303)
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(200)
    expect((await form(ctx, cookie, `/admin/gifts/${shareId}/hide`, { csrf })).status).toBe(303)
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(404)
    expect((await form(ctx, cookie, `/admin/gifts/${shareId}/end`, { csrf })).status).toBe(303)
    expect(ctx.bucket.objects.size).toBe(0)
    const { results } = await ctx.env.DB.prepare('SELECT action FROM admin_audit ORDER BY id').all<{ action: string }>()
    expect(results.map((row) => row.action)).toEqual(['login', 'unhide', 'hide', 'end'])
  })

  it('manages extra e-gift domains that the player and the content check then allow', async () => {
    const ctx = setup({ ADMIN_TOKEN })
    const { cookie } = await login(ctx)
    const csrf = await csrfFrom(ctx, cookie, '/admin/domains')
    expect((await form(ctx, cookie, '/admin/domains', { csrf, domain: 'not a domain' })).headers.get('location')).toBe('/admin/domains?error=1')
    await form(ctx, cookie, '/admin/domains', { csrf, domain: 'www.Shop.Example.com', note: '確認済み' })
    const { domains } = (await (await ctx.request('/s/egift-domains')).json()) as { domains: string[] }
    expect(domains).toContain('giftee.com')
    expect(domains).toContain('shop.example.com')
    await form(ctx, cookie, '/admin/domains/delete', { csrf, domain: 'shop.example.com' })
    expect(((await (await ctx.request('/s/egift-domains')).json()) as { domains: string[] }).domains).not.toContain('shop.example.com')
  })

  it('limits admin login attempts per address', async () => {
    const ctx = setup({ ADMIN_TOKEN })
    for (let i = 0; i < 10; i += 1) await login(ctx, 'wrong')
    expect((await login(ctx)).res.status).toBe(429)
  })
})

describe('F3-08 link previews', () => {
  it('makes the generic og:image absolute on gift pages', async () => {
    const ctx = setup()
    ctx.env.ASSETS = {
      fetch: async () => new Response('<meta property="og:image" content="/og.png" /><title>gift-for-you</title>', { headers: { 'content-type': 'text/html' } }),
    } as unknown as Fetcher
    const res = await ctx.request('/g/AbCdEfGhIj')
    const html = await res.text()
    expect(html).toContain('content="https://gift.example/og.png"')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
  })
})
