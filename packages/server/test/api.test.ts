import { hasJpegMetadata } from '@gfy/imaging'
import { makeTestJpeg } from '@gfy/imaging/testing'
import { describe, expect, it } from 'vitest'
import { sweep } from '../src/store'
import { deviceKey, setup } from './harness'

const DAY = 24 * 3600_000

function share(refs: string[], overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    mode: 'platformer',
    catalogVersion: '2026.10.1',
    locale: 'ja',
    from: { displayName: '健太' },
    to: { displayName: '彩' },
    course: {
      templateId: 'course-01',
      difficulty: 'easy',
      obstaclePresets: ['preset-easy'],
      assist: { autoAssistAfterFails: 3, easyModeDefault: false },
    },
    memoryCoins: refs.map((ref, i) => ({ order: i + 1, photoRef: ref, message: `思い出${i + 1}` })),
    goal: {
      revealEffectId: 'reveal-01',
      giftItem: { itemId: 'mug', label: 'おそろいのマグ' },
      letter: { present: true },
      egift: { present: true, kind: 'url', domain: 'giftee.com', passphrase: false, url: 'https://giftee.com/x' },
    },
    expiresAt: '2099-01-01T00:00:00Z',
    ...overrides,
  }
}

const reveal = (egift: Record<string, unknown> | null = { kind: 'url', url: 'https://giftee.com/cards/abc' }) => ({
  letter: { body: '彩へ。いつもありがとう。' },
  ...(egift ? { egift } : {}),
})

type Ctx = ReturnType<typeof setup>

async function draft(ctx: Ctx, key: string): Promise<string> {
  const res = await ctx.request('/api/gifts', { method: 'POST', key })
  expect(res.status).toBe(201)
  return ((await res.json()) as { giftId: string }).giftId
}

async function upload(ctx: Ctx, key: string, giftId: string, ref: string, bytes = makeTestJpeg({ exif: true })) {
  const res = await ctx.request(`/api/gifts/${giftId}/photos/${ref}`, {
    method: 'PUT',
    key,
    headers: { 'content-type': 'image/jpeg' },
    body: bytes,
  })
  return { status: res.status, body: (await res.json()) as { status?: string; error?: string } }
}

async function putContent(ctx: Ctx, key: string, giftId: string, body: unknown) {
  const res = await ctx.request(`/api/gifts/${giftId}/content`, {
    method: 'PUT',
    key,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

async function purchase(ctx: Ctx, key: string, giftId: string, transactionId = `sandbox-${crypto.randomUUID()}`) {
  return ctx.request(`/api/gifts/${giftId}/purchase`, {
    method: 'POST',
    key,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ platform: 'sandbox', transactionId }),
  })
}

type Published = { shareId: string; url: string; expiresAt: string; revokeCode: string; revokeUrl: string }

async function publishGift(ctx: Ctx, key: string, options: { passphrase?: string; egift?: Record<string, unknown> | null } = {}) {
  const giftId = await draft(ctx, key)
  const refs = ['p-1', 'p-2', 'p-3']
  for (const ref of refs) expect((await upload(ctx, key, giftId, ref)).body.status).toBe('approved')
  const content = await putContent(ctx, key, giftId, { share: share(refs), reveal: reveal(options.egift), passphrase: options.passphrase })
  expect(content.status).toBe(200)
  expect((await purchase(ctx, key, giftId)).status).toBe(200)
  const res = await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })
  expect(res.status).toBe(201)
  return { giftId, published: (await res.json()) as Published }
}

const beacon = (ctx: Ctx, shareId: string, type: string) =>
  ctx.request(`/s/${shareId}/events`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type }) })

async function pushes(ctx: Ctx) {
  const res = await ctx.request('/api/_mock/push')
  return ((await res.json()) as { sent: { token: string; body: string; data: string }[] }).sent
}

describe('publish flow', () => {
  it('uploads, moderates, buys, publishes for 14 days, and serves the gift to the player', async () => {
    const ctx = setup()
    const key = deviceKey()
    const { giftId, published } = await publishGift(ctx, key)
    expect(published.shareId).toMatch(/^[0-9A-Za-z]{10}$/)
    expect(published.url).toBe(`https://gift.example/g/${published.shareId}`)
    expect(published.revokeUrl).toBe(`https://gift.example/r/${published.shareId}`)
    expect(published.revokeCode).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/)
    expect(Date.parse(published.expiresAt) - ctx.clock.now).toBe(14 * DAY)

    // Stored photos carry no Exif or GPS even though the upload did.
    for (const object of ctx.bucket.objects.values()) expect(hasJpegMetadata(object.bytes)).toBe(false)
    expect([...ctx.bucket.objects.keys()].sort()).toEqual(['p-1', 'p-2', 'p-3'].map((ref) => `gifts/${giftId}/${ref}.jpg`))

    const shareRes = await ctx.request(`/s/${published.shareId}/share`)
    expect(shareRes.status).toBe(200)
    expect(shareRes.headers.get('x-robots-tag')).toContain('noindex')
    const body = (await shareRes.json()) as ReturnType<typeof share>
    expect(body.expiresAt).toBe(published.expiresAt)
    expect(body.goal.egift).toEqual({ present: true, kind: 'url', domain: 'giftee.com', passphrase: false })

    const photo = await ctx.request(`/s/${published.shareId}/photos/p-2`)
    expect(photo.status).toBe(200)
    expect(photo.headers.get('content-type')).toBe('image/jpeg')
    expect(hasJpegMetadata(new Uint8Array(await photo.arrayBuffer()))).toBe(false)
    expect((await ctx.request(`/s/${published.shareId}/photos/p-9`)).status).toBe(404)
  })

  it('refuses to publish before content, before purchase, and twice', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(409)
    await upload(ctx, key, giftId, 'p-1')
    await putContent(ctx, key, giftId, { share: share(['p-1']), reveal: reveal() })
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(402)
    const bad = await ctx.request(`/api/gifts/${giftId}/purchase`, {
      method: 'POST',
      key,
      body: JSON.stringify({ platform: 'ios', transactionId: 'real-money' }),
    })
    expect(bad.status).toBe(402)
    expect((await purchase(ctx, key, giftId, 'sandbox-0000aaaa')).status).toBe(200)
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(201)
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(409)
    // One sandbox transaction buys one gift.
    const other = await draft(ctx, key)
    expect((await purchase(ctx, key, other, 'sandbox-0000aaaa')).status).toBe(409)
  })

  it('drops uploaded photos no coin uses when publishing', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    await upload(ctx, key, giftId, 'p-1')
    await upload(ctx, key, giftId, 'p-unused')
    await putContent(ctx, key, giftId, { share: share(['p-1']), reveal: reveal() })
    await purchase(ctx, key, giftId)
    await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })
    expect([...ctx.bucket.objects.keys()]).toEqual([`gifts/${giftId}/p-1.jpg`])
  })
})

describe('moderation', () => {
  it('rejects a flagged photo, keeps it out of storage, and blocks publishing until it is replaced', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    await upload(ctx, key, giftId, 'p-1')
    const flagged = await upload(ctx, key, giftId, 'p-2', makeTestJpeg({ scan: [...new TextEncoder().encode('GFY-NG')] }))
    expect(flagged).toEqual({ status: 200, body: { ref: 'p-2', status: 'rejected', reason: 'flagged' } })
    expect(ctx.bucket.objects.has(`gifts/${giftId}/p-2.jpg`)).toBe(false)
    const blocked = await putContent(ctx, key, giftId, { share: share(['p-1', 'p-2']), reveal: reveal() })
    expect(blocked).toEqual({ status: 422, body: { error: 'photo_rejected', refs: ['p-2'] } })
    await upload(ctx, key, giftId, 'p-2')
    expect((await putContent(ctx, key, giftId, { share: share(['p-1', 'p-2']), reveal: reveal() })).status).toBe(200)
  })

  it('rejects flagged text', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    await upload(ctx, key, giftId, 'p-1')
    const res = await putContent(ctx, key, giftId, { share: share(['p-1']), reveal: { letter: { body: 'NGWORD' } } })
    expect(res).toEqual({ status: 422, body: { error: 'text_rejected' } })
  })
})

describe('uploads', () => {
  it('accepts only small jpeg files inside 1080px from the owner', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    expect((await upload(ctx, key, giftId, 'p-1', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]))).status).toBe(415)
    expect((await upload(ctx, key, giftId, 'p-1', makeTestJpeg({ width: 1081, height: 600 }))).body.error).toBe('too_many_pixels')
    const huge = new Uint8Array(1_600_000)
    huge.set(makeTestJpeg())
    expect((await upload(ctx, key, giftId, 'p-1', huge)).status).toBe(413)
    expect((await upload(ctx, key, giftId, 'Bad_Ref')).status).toBe(400)
    expect((await upload(ctx, deviceKey(), giftId, 'p-1')).status).toBe(404)
    for (let i = 0; i < 10; i += 1) expect((await upload(ctx, key, giftId, `p-${i}`)).status).toBe(200)
    expect((await upload(ctx, key, giftId, 'p-10')).status).toBe(409)
    // Replacing an existing ref is still fine at the cap.
    expect((await upload(ctx, key, giftId, 'p-3')).status).toBe(200)
  })

  it('needs a well-formed device key', async () => {
    const ctx = setup()
    expect((await ctx.request('/api/gifts', { method: 'POST' })).status).toBe(401)
    expect((await ctx.request('/api/gifts', { method: 'POST', key: 'short' })).status).toBe(401)
  })

  it('limits drafts per device per day', async () => {
    const ctx = setup()
    const key = deviceKey()
    for (let i = 0; i < 20; i += 1) await draft(ctx, key)
    expect((await ctx.request('/api/gifts', { method: 'POST', key })).status).toBe(429)
    ctx.clock.now += DAY + 1
    expect((await ctx.request('/api/gifts', { method: 'POST', key })).status).toBe(201)
  })
})

describe('content rules', () => {
  async function tryContent(body: Record<string, unknown>, refs = ['p-1']) {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    for (const ref of refs) await upload(ctx, key, giftId, ref)
    return putContent(ctx, key, giftId, { share: share(refs), reveal: reveal(), ...body })
  }

  it('blocks shorteners and plain http, and accepts off-list https with its domain', async () => {
    expect((await tryContent({ reveal: reveal({ kind: 'url', url: 'https://bit.ly/abc' }) })).body.error).toBe('egift_shortener')
    expect((await tryContent({ reveal: reveal({ kind: 'url', url: 'http://giftee.com/abc' }) })).body.error).toBe('egift_scheme')
    const offList = await tryContent({ reveal: reveal({ kind: 'url', url: 'https://shop.example.net/card/1' }) })
    expect(offList.status).toBe(200)
    expect((offList.body.share as ReturnType<typeof share>).goal.egift).toEqual({
      present: true,
      kind: 'url',
      domain: 'shop.example.net',
      passphrase: false,
    })
  })

  it('stores a code e-gift and a gift with no e-gift', async () => {
    const code = await tryContent({ reveal: reveal({ kind: 'code', code: 'ABCD-1234' }) })
    expect((code.body.share as ReturnType<typeof share>).goal.egift).toEqual({ present: true, kind: 'code', passphrase: false })
    const none = await tryContent({ reveal: reveal(null) })
    expect((none.body.share as ReturnType<typeof share>).goal.egift).toEqual({ present: false })
  })

  it('caps coins at the template slots and checks the passphrase length', async () => {
    const five = ['p-1', 'p-2', 'p-3', 'p-4', 'p-5']
    expect((await tryContent({}, five)).body.error).toBe('coin_count')
    expect((await tryContent({ passphrase: 'abc' })).body.error).toBe('passphrase_length')
    expect((await tryContent({ passphrase: 'ひみつのあいことば' })).status).toBe(200)
    expect((await tryContent({ passphrase: 'abcd', reveal: reveal(null) })).body.error).toBe('passphrase_without_egift')
  })

  it('refuses coins whose photo was never uploaded', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    const res = await putContent(ctx, key, giftId, { share: share(['p-1']), reveal: reveal() })
    expect(res).toEqual({ status: 422, body: { error: 'photo_missing', refs: ['p-1'] } })
  })
})

describe('beacons and notifications', () => {
  it('counts opens and goals and pushes each type once', async () => {
    const ctx = setup()
    const key = deviceKey()
    const pushRes = await ctx.request('/api/devices/push', {
      method: 'PUT',
      key,
      body: JSON.stringify({ token: 'ExponentPushToken[abc123xyz]', platform: 'expo' }),
    })
    expect(pushRes.status).toBe(204)
    const { published } = await publishGift(ctx, key)
    expect((await ctx.request(`/s/${published.shareId}/reveal`)).status).toBe(403)
    for (let i = 0; i < 3; i += 1) expect((await beacon(ctx, published.shareId, 'opened')).status).toBe(204)
    await beacon(ctx, published.shareId, 'goal_reached')
    await beacon(ctx, published.shareId, 'goal_reached')
    await beacon(ctx, published.shareId, 'bogus')
    const sent = await pushes(ctx)
    expect(sent.map((entry) => entry.body)).toEqual(['彩さんがギフトを開きました', '彩さんがゴールにたどりつきました'])
    expect(sent.every((entry) => entry.token === 'ExponentPushToken[abc123xyz]')).toBe(true)

    const list = await ctx.request('/api/gifts', { key })
    const [gift] = ((await list.json()) as { gifts: Record<string, unknown>[] }).gifts
    expect(gift).toMatchObject({ status: 'published', toName: '彩', openedCount: 3, goalCount: 2, shareId: published.shareId })

    const letter = await ctx.request(`/s/${published.shareId}/reveal`)
    expect(letter.status).toBe(200)
    expect(await letter.json()).toEqual(reveal())
  })

  it('does not push for a device without a token, and ignores unknown gifts', async () => {
    const ctx = setup()
    const { published } = await publishGift(ctx, deviceKey())
    await beacon(ctx, published.shareId, 'opened')
    expect((await beacon(ctx, 'ZZZZZZZZZZ', 'opened')).status).toBe(204)
    expect(await pushes(ctx)).toEqual([])
  })

  it('hides the mock outbox unless inspection is on', async () => {
    const ctx = setup({ MOCK_INSPECT: '0' })
    expect((await ctx.request('/api/_mock/push')).status).toBe(404)
  })
})

describe('passphrase', () => {
  it('locks the e-gift until the passphrase is given, and limits guesses', async () => {
    const ctx = setup()
    const { published } = await publishGift(ctx, deviceKey(), { passphrase: 'ひみつ123', egift: { kind: 'code', code: 'GIFT-9999' } })
    const shareBody = (await (await ctx.request(`/s/${published.shareId}/share`)).json()) as ReturnType<typeof share>
    expect(shareBody.goal.egift.passphrase).toBe(true)
    await beacon(ctx, published.shareId, 'goal_reached')
    const locked = await (await ctx.request(`/s/${published.shareId}/reveal`)).json()
    expect(locked).toEqual({ letter: { body: '彩へ。いつもありがとう。' }, egift: { kind: 'code', locked: true } })
    const tryUnlock = (passphrase: string) =>
      ctx.request(`/s/${published.shareId}/unlock`, { method: 'POST', body: JSON.stringify({ passphrase }) })
    expect((await tryUnlock('ちがう')).status).toBe(403)
    const ok = await tryUnlock('ひみつ123')
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ kind: 'code', code: 'GIFT-9999' })
    for (let i = 0; i < 3; i += 1) await tryUnlock('ちがう')
    expect((await tryUnlock('ひみつ123')).status).toBe(429)
    ctx.clock.now += 11 * 60_000
    expect((await tryUnlock('ひみつ123')).status).toBe(200)
  })
})

describe('revoke and expiry', () => {
  async function gone(ctx: Ctx, shareId: string) {
    expect((await ctx.request(`/s/${shareId}/share`)).status).toBe(404)
    expect((await ctx.request(`/s/${shareId}/photos/p-1`)).status).toBe(404)
    expect((await ctx.request(`/s/${shareId}/reveal`)).status).toBe(404)
    expect(ctx.bucket.objects.size).toBe(0)
  }

  it('revokes from the web with the code, deleting photos', async () => {
    const ctx = setup()
    const { published } = await publishGift(ctx, deviceKey())
    const page = await ctx.request(`/r/${published.shareId}`)
    expect(page.headers.get('x-frame-options')).toBe('DENY')
    expect(await page.text()).toContain('失効コード')
    const post = (code: string) =>
      ctx.request(`/r/${published.shareId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ code }).toString(),
      })
    expect((await post('AAAA-BBBB-CCCC')).status).toBe(403)
    // Lowercase and missing dashes still match.
    const done = await post(published.revokeCode.toLowerCase().replaceAll('-', ''))
    expect(done.status).toBe(200)
    expect(await done.text()).toContain('data-state="done"')
    await gone(ctx, published.shareId)
    expect((await post(published.revokeCode)).status).toBe(403)
  })

  it('revokes from the app with the device key only', async () => {
    const ctx = setup()
    const key = deviceKey()
    const { giftId, published } = await publishGift(ctx, key)
    expect((await ctx.request(`/api/gifts/${giftId}`, { method: 'DELETE', key: deviceKey() })).status).toBe(404)
    expect((await ctx.request(`/api/gifts/${giftId}`, { method: 'DELETE', key })).status).toBe(204)
    await gone(ctx, published.shareId)
    const list = (await (await ctx.request('/api/gifts', { key })).json()) as { gifts: { status: string; url: string | null }[] }
    expect(list.gifts[0]).toMatchObject({ status: 'revoked', url: null })
  })

  it('expires after 14 days and the sweep deletes photos', async () => {
    const ctx = setup()
    const key = deviceKey()
    const { published } = await publishGift(ctx, key)
    ctx.clock.now += 14 * DAY - 1
    expect((await ctx.request(`/s/${published.shareId}/share`)).status).toBe(200)
    ctx.clock.now += 1
    expect((await ctx.request(`/s/${published.shareId}/share`)).status).toBe(404)
    const list = (await (await ctx.request('/api/gifts', { key })).json()) as { gifts: { status: string }[] }
    expect(list.gifts[0].status).toBe('expired')
    expect(await sweep(ctx.env.DB, ctx.env.PHOTOS, ctx.clock.now, 2 * DAY)).toEqual({ expired: 1, drafts: 0, purged: 0 })
    await gone(ctx, published.shareId)
  })

  it('sweeps drafts nobody published', async () => {
    const ctx = setup()
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    await upload(ctx, key, giftId, 'p-1')
    ctx.clock.now += 3 * DAY
    expect(await sweep(ctx.env.DB, ctx.env.PHOTOS, ctx.clock.now, 2 * DAY)).toEqual({ expired: 0, drafts: 1, purged: 0 })
    expect(ctx.bucket.objects.size).toBe(0)
    expect((await upload(ctx, key, giftId, 'p-1')).status).toBe(404)
  })
})

describe('config and cors', () => {
  it('refuses to publish without a public origin for the links', async () => {
    const ctx = setup({ PUBLIC_ORIGIN: '' })
    const key = deviceKey()
    const giftId = await draft(ctx, key)
    await upload(ctx, key, giftId, 'p-1')
    await putContent(ctx, key, giftId, { share: share(['p-1']), reveal: reveal() })
    await purchase(ctx, key, giftId)
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(503)
    ctx.env.PUBLIC_ORIGIN = 'https://gift.example'
    expect((await ctx.request(`/api/gifts/${giftId}/publish`, { method: 'POST', key })).status).toBe(201)
    // History still lists without an origin, just without links.
    ctx.env.PUBLIC_ORIGIN = ''
    const list = await ctx.request('/api/gifts', { key })
    expect(list.status).toBe(200)
    expect(((await list.json()) as { gifts: { url: string | null }[] }).gifts[0].url).toBeNull()
  })

  it('fails closed only where a missing provider is needed', async () => {
    const ctx = setup()
    const key = deviceKey()
    const { published } = await publishGift(ctx, key)
    // Deployed defaults name no provider.
    ctx.env.MODERATION = 'none'
    ctx.env.PURCHASE = 'none'
    expect((await ctx.request('/api/health')).status).toBe(200)
    expect((await ctx.request(`/s/${published.shareId}/share`)).status).toBe(200)
    const giftId = await draft(ctx, key)
    expect((await upload(ctx, key, giftId, 'p-1')).status).toBe(503)
    const bought = await ctx.request(`/api/gifts/${giftId}/purchase`, { method: 'POST', key, body: JSON.stringify({ platform: 'sandbox', transactionId: 'sandbox-12345678' }) })
    expect(bought.status).toBe(503)
  })

  it('does not count revoke guesses for ids without a published gift', async () => {
    const ctx = setup()
    for (const id of ['x', 'not-a-share-id', 'ZZZZZZZZZZZ', 'ZZZZZZZZZZ']) {
      const res = await ctx.request(`/r/${id}`, { method: 'POST', body: new URLSearchParams({ code: 'A' }) })
      expect(res.status).toBe(403)
    }
    expect(await ctx.env.DB.prepare('SELECT COUNT(*) AS n FROM attempts').first()).toEqual({ n: 0 })
  })

  it('answers preflight only for the creator web origin', async () => {
    const ctx = setup()
    const preflight = (origin: string) =>
      ctx.request('/api/gifts', {
        method: 'OPTIONS',
        headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization' },
      })
    expect((await preflight('http://127.0.0.1:8081')).headers.get('access-control-allow-origin')).toBe('http://127.0.0.1:8081')
    expect((await preflight('https://evil.example')).headers.get('access-control-allow-origin')).toBeNull()
  })
})
