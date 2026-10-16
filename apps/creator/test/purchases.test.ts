import { describe, expect, it, vi } from 'vitest'
import { Api } from '../src/lib/api'
import { purchaseAndPublish } from '../src/lib/publish'
import { dropPending, loadPending, PurchaseCancelled, savePending, settlePurchases, type Store } from '../src/lib/purchases'
import { memoryKV, wipeLocalData } from '../src/lib/storage'

type Handler = (method: string, path: string, body: unknown) => { status: number; body: unknown }

function server(handler: Handler) {
  const calls: string[] = []
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    calls.push(`${method} ${url.pathname}`)
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined
    const reply = handler(method, url.pathname, body)
    return new Response(JSON.stringify(reply.body), { status: reply.status })
  })
  return { api: new Api('https://x', async () => 'k'.repeat(43), fetchImpl as typeof fetch), calls }
}

const published = { shareId: 'Ab3dEf7hJk', url: 'https://x/g/Ab3dEf7hJk', expiresAt: '2026-11-15T00:00:00.000Z', revokeCode: 'AAAA-BBBB-CCCC', revokeUrl: 'u', tier: 'premium' }

describe('F3-03 purchase flow in the app', () => {
  it('buys the chosen tier, keeps the proof until the server has it, then publishes', async () => {
    const kv = memoryKV()
    const seen: unknown[] = []
    const { api, calls } = server((_method, path, body) => {
      if (path.endsWith('/purchase')) {
        seen.push(body)
        return { status: 200, body: { ok: true, tier: 'premium' } }
      }
      if (path.endsWith('/publish')) return { status: 201, body: published }
      return { status: 404, body: { error: 'not_found' } }
    })
    const store: Store = {
      label: 'test',
      purchase: async (_giftId, tier) => {
        expect(tier).toBe('premium')
        return { platform: 'ios', transactionId: '1000', productId: 'gfy_gift_premium' }
      },
    }
    const result = await purchaseAndPublish('g1', store, api, () => {}, { tier: 'premium', kv })
    expect(result.tier).toBe('premium')
    expect(seen).toEqual([{ platform: 'ios', transactionId: '1000', productId: 'gfy_gift_premium' }])
    expect(calls).toEqual(['POST /api/gifts/g1/purchase', 'POST /api/gifts/g1/publish'])
    expect(await loadPending(kv)).toEqual([])
  })

  it('leaves a paid transaction pending when the server cannot be reached', async () => {
    const kv = memoryKV()
    const offline = new Api('https://x', async () => 'k'.repeat(43), (async () => {
      throw new TypeError('offline')
    }) as typeof fetch)
    const store: Store = { label: 't', purchase: async () => ({ platform: 'android', transactionId: 'GPA.1', productId: 'gfy_gift_standard' }) }
    await expect(purchaseAndPublish('g1', store, offline, () => {}, { kv })).rejects.toBeTruthy()
    expect((await loadPending(kv)).map((entry) => entry.proof.transactionId)).toEqual(['GPA.1'])
  })

  it('does not record anything when the buyer cancels', async () => {
    const kv = memoryKV()
    const { api, calls } = server(() => ({ status: 500, body: {} }))
    const store: Store = {
      label: 't',
      purchase: async () => {
        throw new PurchaseCancelled('cancelled')
      },
    }
    await expect(purchaseAndPublish('g1', store, api, () => {}, { kv })).rejects.toBeInstanceOf(PurchaseCancelled)
    expect(calls).toEqual([])
    expect(await loadPending(kv)).toEqual([])
  })

  it('spends a credit without opening the store', async () => {
    const { api, calls } = server((_m, path, body) => {
      if (path.endsWith('/purchase')) {
        expect(body).toEqual({ platform: 'credit', transactionId: 'tx-9' })
        return { status: 200, body: { ok: true } }
      }
      return { status: 201, body: published }
    })
    const store: Store = { label: 't', purchase: vi.fn() }
    await purchaseAndPublish('g1', store, api, () => {}, { credit: 'tx-9' })
    expect(store.purchase).not.toHaveBeenCalled()
    expect(calls).toEqual(['POST /api/gifts/g1/purchase', 'POST /api/gifts/g1/publish'])
  })

  it('replays pending purchases and unsynced store transactions on start, then lists credits', async () => {
    const kv = memoryKV()
    await savePending(kv, { giftId: 'g-done', proof: { platform: 'ios', transactionId: 'a' }, at: 1 })
    await savePending(kv, { giftId: 'g-gone', proof: { platform: 'ios', transactionId: 'b' }, at: 2 })
    await savePending(kv, { giftId: 'g-later', proof: { platform: 'ios', transactionId: 'c' }, at: 3 })
    await savePending(kv, { giftId: 'g-refunded', proof: { platform: 'ios', transactionId: 'r' }, at: 4 })
    await savePending(kv, { giftId: 'g-lag', proof: { platform: 'ios', transactionId: 'l' }, at: Date.now() - 3600_000 })
    await savePending(kv, { giftId: 'g-used', proof: { platform: 'ios', transactionId: 'u' }, at: 6 })
    // Not listed by RevenueCat for more than a week: given up.
    await savePending(kv, { giftId: 'g-lag-old', proof: { platform: 'ios', transactionId: 'old-lag' }, at: Date.now() - 8 * 24 * 3600_000 })
    const synced: string[] = []
    const { api } = server((method, path, body) => {
      const tx = (body as { transactionId?: string } | undefined)?.transactionId
      if (path === '/api/gifts/g-done/purchase') return { status: 200, body: { ok: true } }
      if (path === '/api/gifts/g-gone/purchase') return { status: 404, body: { error: 'not_found' } }
      if (path === '/api/gifts/g-later/purchase') return { status: 503, body: { error: 'purchase_unavailable' } }
      if (path === '/api/gifts/g-refunded/purchase') return { status: 402, body: { error: 'purchase_invalid', reason: 'refunded' } }
      if (method === 'POST' && path === '/api/purchases' && tx === 'r') return { status: 402, body: { error: 'purchase_invalid', reason: 'refunded' } }
      // The server answers a transaction RevenueCat never listed the same way when it is handed over.
      if (method === 'POST' && path === '/api/purchases' && tx === 'old-lag') return { status: 402, body: { error: 'purchase_invalid', reason: 'receipt' } }
      // RevenueCat has not listed the transaction yet: may pass on a later start.
      if (path === '/api/gifts/g-lag/purchase' || path === '/api/gifts/g-lag-old/purchase') {
        return { status: 402, body: { error: 'purchase_invalid', reason: 'receipt' } }
      }
      // The gift took another purchase, and handing this one over as a credit fails while offline-ish.
      if (path === '/api/gifts/g-used/purchase') return { status: 409, body: { error: 'purchase_used' } }
      if (method === 'POST' && path === '/api/purchases' && tx === 'u') return { status: 503, body: { error: 'purchase_unavailable' } }
      if (method === 'POST' && path === '/api/purchases') {
        synced.push(tx!)
        return { status: 200, body: { transactionId: tx, tier: 'standard', claimed: false } }
      }
      if (path === '/api/purchases/unclaimed') return { status: 200, body: { purchases: [{ transactionId: 'b', productId: 'gfy_gift_standard', tier: 'standard' }] } }
      return { status: 404, body: {} }
    })
    const store: Store = {
      label: 't',
      purchase: vi.fn(),
      transactions: async () => [
        { platform: 'ios', transactionId: 'old', productId: 'gfy_gift_standard' },
        { platform: 'ios', transactionId: 'new', productId: 'gfy_gift_premium' },
      ],
    }
    const credits = await settlePurchases(api, kv, store)
    expect(credits.map((credit) => credit.transactionId)).toEqual(['b'])
    // g-gone became a credit and g-refunded is dropped for good; g-later (503), g-lag (receipt not yet
    // listed), and g-used (its credit sync failed) wait for the next start.
    expect((await loadPending(kv)).map((entry) => entry.giftId)).toEqual(['g-later', 'g-lag', 'g-used'])
    expect(synced).toEqual(['b', 'old', 'new'])
    // Store transactions are synced once.
    synced.length = 0
    await settlePurchases(api, kv, store)
    expect(synced).toEqual([])
    for (const tx of ['c', 'l', 'u']) await dropPending(kv, tx)
    expect(await loadPending(kv)).toEqual([])
  })
})

describe('F3-12 local data', () => {
  it('wipes everything the app stored, and nothing else', async () => {
    const kv = memoryKV()
    await kv.setItem('gfy:draft:v1', '{}')
    await kv.setItem('gfy:photo:p-a', 'x')
    await kv.setItem('gfy:history:v1', '[]')
    await kv.setItem('other-app', 'keep')
    expect(await wipeLocalData(kv)).toBe(3)
    expect([...kv.data.keys()]).toEqual(['other-app'])
  })
})
