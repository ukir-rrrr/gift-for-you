import { hasJpegMetadata } from '@gfy/imaging'
import { makeTestJpeg } from '@gfy/imaging/testing'
import { describe, expect, it, vi } from 'vitest'
import { Api, ApiError, describeError } from '../src/lib/api'
import { emptyDraft, reduceDraft, type Draft } from '../src/lib/draft'
import { cleanJpeg, resizeTarget } from '../src/lib/photo'
import { purchaseAndPublish, uploadAndModerate, type Store } from '../src/lib/publish'
import { qrCardSvg, qrMatrix, qrPath } from '../src/lib/qr'
import { buildContent } from '../src/lib/share'
import { addHistory, clearDraft, loadDraft, loadHistory, loadPhoto, memoryKV, photoDataUrl, prunePhotos, saveDraft, savePhoto } from '../src/lib/storage'

function readyDraft(refs = ['p-a', 'p-b', 'p-c']): Draft {
  let draft = emptyDraft(0)
  draft = reduceDraft(draft, { type: 'template', templateId: 'course-01' })
  draft = reduceDraft(draft, { type: 'difficulty', difficulty: 'normal' })
  for (const ref of refs) draft = reduceDraft(draft, { type: 'addCoin', coin: { photoRef: ref, width: 100, height: 100, message: ref } })
  draft = reduceDraft(draft, { type: 'item', itemId: 'book' })
  draft = reduceDraft(draft, { type: 'names', fromName: '健太', toName: '彩' })
  return reduceDraft(draft, { type: 'letter', letter: 'ありがとう' })
}

describe('storage', () => {
  it('saves and restores a draft and its photos, and prunes stale ones', async () => {
    const kv = memoryKV()
    const draft = readyDraft()
    await saveDraft(kv, draft)
    expect(await loadDraft(kv)).toEqual(draft)
    const jpeg = makeTestJpeg()
    await savePhoto(kv, 'p-a', jpeg)
    await savePhoto(kv, 'p-old', jpeg)
    expect(await loadPhoto(kv, 'p-a')).toEqual(jpeg)
    expect(await photoDataUrl(kv, 'p-a')).toMatch(/^data:image\/jpeg;base64,\/9j\//)
    expect(await prunePhotos(kv, ['p-a'])).toBe(1)
    expect(await loadPhoto(kv, 'p-old')).toBeNull()
    await clearDraft(kv)
    expect(await loadDraft(kv)).toBeNull()
    expect(kv.data.size).toBe(0)
  })

  it('ignores corrupt or foreign drafts', async () => {
    const kv = memoryKV()
    await kv.setItem('gfy:draft:v1', '{nope')
    expect(await loadDraft(kv)).toBeNull()
    await kv.setItem('gfy:draft:v1', JSON.stringify({ version: 9 }))
    expect(await loadDraft(kv)).toBeNull()
    await kv.setItem('gfy:draft:v1', JSON.stringify({ version: 1, toName: '彩' }))
    expect(await loadDraft(kv)).toMatchObject({ toName: '彩', coins: [], egift: { kind: 'none' } })
  })

  it('keeps the newest history first without duplicates', async () => {
    const kv = memoryKV()
    const entry = (giftId: string) => ({ giftId, shareId: 's', url: 'u', revokeUrl: 'r', toName: '彩', expiresAt: 'e', publishedAt: 1 })
    await addHistory(kv, entry('g1'))
    await addHistory(kv, entry('g2'))
    await addHistory(kv, entry('g1'))
    expect((await loadHistory(kv)).map((gift) => gift.giftId)).toEqual(['g1', 'g2'])
  })
})

describe('photo checks', () => {
  it('strips leftover Exif and refuses oversize photos', () => {
    const clean = cleanJpeg(makeTestJpeg({ exif: true, width: 1080, height: 720 }))
    expect(hasJpegMetadata(clean.bytes)).toBe(false)
    expect(clean).toMatchObject({ width: 1080, height: 720 })
    expect(() => cleanJpeg(makeTestJpeg({ width: 2000, height: 100 }))).toThrow()
    expect(() => cleanJpeg(new Uint8Array([1, 2, 3, 4, 5]))).toThrow()
  })

  it('resizes only the long edge, and only when needed', () => {
    expect(resizeTarget(4032, 3024)).toEqual({ width: 1080 })
    expect(resizeTarget(3024, 4032)).toEqual({ height: 1080 })
    expect(resizeTarget(1080, 1080)).toBeNull()
  })
})

describe('qr', () => {
  it('encodes the share link and draws a card', () => {
    const url = 'https://gift.example/g/Ab3dEf7hJk'
    const matrix = qrMatrix(url)
    expect(matrix.size).toBeGreaterThanOrEqual(25)
    // Finder pattern corner is dark.
    expect(matrix.dark(0, 0)).toBe(true)
    expect(qrPath(url).size).toBe(matrix.size + 8)
    const card = qrCardSvg({ url, toName: '<彩>', expiresLabel: '2026年10月30日まで' })
    expect(card).toContain('&lt;彩&gt;へ')
    expect(card).not.toContain('<彩>')
  })
})

type Call = { method: string; path: string; body?: unknown }

function fakeServer(rejectRefs: string[] = []) {
  const calls: Call[] = []
  let gifts = 0
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push({ method, path: url.pathname, body: init?.body })
    expect(new Headers(init?.headers).get('authorization')).toMatch(/^Device /)
    const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })
    if (method === 'POST' && url.pathname === '/api/gifts') return reply(201, { giftId: `g${++gifts}` })
    const photo = url.pathname.match(/gifts\/([^/]+)\/photos\/(.+)$/)
    if (photo && photo[1] !== 'g7' && !/^g\d+$/.test(photo[1])) return reply(404, { error: 'not_found' })
    if (photo) {
      const bytes = new Uint8Array(init!.body as ArrayBuffer)
      expect(hasJpegMetadata(bytes)).toBe(false)
      return reply(200, { ref: photo[2], status: rejectRefs.includes(photo[2]) ? 'rejected' : 'approved' })
    }
    if (url.pathname.endsWith('/content')) return reply(200, { ok: true })
    if (url.pathname.endsWith('/purchase')) return reply(200, { ok: true })
    if (url.pathname.endsWith('/publish')) {
      return reply(201, { shareId: 'Ab3dEf7hJk', url: 'https://x/g/Ab3dEf7hJk', expiresAt: '2026-10-30T00:00:00.000Z', revokeCode: 'AAAA-BBBB-CCCC', revokeUrl: 'https://x/r/Ab3dEf7hJk' })
    }
    return reply(404, { error: 'not_found' })
  })
  const api = new Api('https://x', async () => 'k'.repeat(43), fetchImpl as typeof fetch)
  return { api, calls }
}

const store: Store = { label: 'Sandbox', purchase: async () => ({ platform: 'sandbox', transactionId: 'sandbox-12345678' }) }

describe('publish flow', () => {
  const photos = async () => makeTestJpeg({ exif: true })

  it('uploads stripped photos, then content, then buys and publishes', async () => {
    const { api, calls } = fakeServer()
    const draft = readyDraft()
    const content = buildContent(draft)
    if (!content.ok) throw new Error(content.issues.join())
    const remembered: (string | null)[] = []
    const stages: string[] = []
    const result = await uploadAndModerate(draft, content.value, { api, readPhoto: photos, rememberGift: (id) => remembered.push(id) }, (stage) =>
      stages.push(stage),
    )
    expect(result).toMatchObject({ ok: true, giftId: 'g1' })
    expect(remembered).toEqual(['g1'])
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /api/gifts',
      'PUT /api/gifts/g1/photos/p-a',
      'PUT /api/gifts/g1/photos/p-b',
      'PUT /api/gifts/g1/photos/p-c',
      'PUT /api/gifts/g1/content',
    ])
    const published = await purchaseAndPublish('g1', store, api, (stage) => stages.push(stage))
    expect(published.shareId).toBe('Ab3dEf7hJk')
    expect(stages).toEqual(['upload', 'upload', 'upload', 'upload', 'moderation', 'purchase', 'issue', 'done'])
  })

  it('stops before content when a photo is rejected', async () => {
    const { api, calls } = fakeServer(['p-b'])
    const draft = { ...readyDraft(), serverGiftId: 'g7' }
    const content = buildContent(draft)
    if (!content.ok) throw new Error('draft')
    const result = await uploadAndModerate(draft, content.value, { api, readPhoto: photos, rememberGift: () => {} })
    expect(result).toEqual({ ok: false, giftId: 'g7', rejected: ['p-b'] })
    expect(calls.some((call) => call.path.endsWith('/content'))).toBe(false)
  })

  it('starts a fresh server draft when the old one was swept', async () => {
    const { api, calls } = fakeServer()
    const draft = { ...readyDraft(['p-a']), serverGiftId: 'gone' }
    const content = buildContent(draft)
    if (!content.ok) throw new Error('draft')
    const remembered: (string | null)[] = []
    const result = await uploadAndModerate(draft, content.value, { api, readPhoto: photos, rememberGift: (id) => remembered.push(id) })
    expect(result).toMatchObject({ ok: true, giftId: 'g1' })
    expect(remembered).toEqual(['g1'])
    expect(calls[0].path).toBe('/api/gifts/gone/photos/p-a')
  })

  it('reports a missing local photo instead of uploading', async () => {
    const { api } = fakeServer()
    const draft = readyDraft(['p-a'])
    const content = buildContent(draft)
    if (!content.ok) throw new Error('draft')
    const result = await uploadAndModerate(draft, content.value, { api, readPhoto: async () => null, rememberGift: () => {} })
    expect(result.ok).toBe(false)
  })
})

describe('api errors', () => {
  it('turns server answers into Japanese', async () => {
    const api = new Api('https://x', async () => 'k', (async () => new Response('{"error":"text_rejected"}', { status: 422 })) as typeof fetch)
    const error = await api.putContent('g', { share: {} as never, reveal: {} as never, passphrase: null }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(describeError(error)).toBe('公開できない言葉が含まれています。文章を見直してください')
    const offline = new Api('https://x', async () => 'k', (async () => {
      throw new TypeError('net')
    }) as typeof fetch)
    expect(describeError(await offline.listGifts().catch((e: unknown) => e))).toContain('つながりません')
  })
})

describe('history', () => {
  it('joins local entries with the server state', async () => {
    const { mergeHistory } = await import('../src/lib/history')
    const local = [
      { giftId: 'g1', shareId: 's1', url: 'u', revokeUrl: 'r', toName: '彩', expiresAt: '2026-10-30T00:00:00.000Z', publishedAt: 1 },
      { giftId: 'g2', shareId: 's2', url: 'u', revokeUrl: 'r', toName: '海', expiresAt: '2026-10-31T00:00:00.000Z', publishedAt: 2 },
    ]
    const remote = [
      {
        giftId: 'g1', status: 'revoked' as const, shareId: 's1', url: null, toName: '彩', createdAt: 0, publishedAt: 0,
        expiresAt: Date.parse('2026-10-30T00:00:00Z'), openedAt: 5, goalAt: null, openedCount: 1, goalCount: 0,
      },
    ]
    expect(mergeHistory(local, remote).map((row) => [row.giftId, row.status, row.opened])).toEqual([
      ['g1', 'revoked', true],
      ['g2', 'unknown', false],
    ])
    expect(mergeHistory(local, null).every((row) => row.status === 'published')).toBe(true)
  })
})
