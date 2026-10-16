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
    const synced: string[] = []
    const { api } = server((method, path, body) => {
      const tx = (body as { transactionId?: string } | undefined)?.transactionId
      if (path === '/api/gifts/g-done/purchase') return { status: 200, body: { ok: true } }
      if (path === '/api/gifts/g-gone/purchase') return { status: 404, body: { error: 'not_found' } }
      if (path === '/api/gifts/g-later/purchase') return { status: 503, body: { error: 'purchase_unavailable' } }
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
    // g-gone became a credit; g-later waits for the next start.
    expect((await loadPending(kv)).map((entry) => entry.giftId)).toEqual(['g-later'])
    expect(synced).toEqual(['b', 'old', 'new'])
    // Store transactions are synced once.
    synced.length = 0
    await settlePurchases(api, kv, store)
    expect(synced).toEqual([])
    await dropPending(kv, 'c')
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
