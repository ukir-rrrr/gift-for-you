import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchReveal, flushQueue, goalMarked, isCrawler, postEvent, readQueue } from '../src/net'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (key) => void data.delete(key),
    setItem: (key, value) => void data.set(key, String(value)),
  }
}

function throwingStorage(): Storage {
  const fail = () => {
    throw new Error('blocked')
  }
  return { length: 0, clear: fail, getItem: fail, key: fail, removeItem: fail, setItem: fail }
}

const HUMAN = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Line/14.16.0'

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: HUMAN })
  vi.stubGlobal('document', { visibilityState: 'visible' })
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('sessionStorage', memoryStorage())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('beacons', () => {
  it('sends only the event type and time', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    expect(await postEvent('demo', 'opened')).toBe('sent')
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('/s/demo/events')
    expect(init.credentials).toBe('omit')
    expect(Object.keys(JSON.parse(String(init.body))).sort()).toEqual(['at', 'type'])
  })

  it('queues a failed send without throwing, and flushes it later', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    expect(await postEvent('demo', 'opened')).toBe('queued')
    expect(await postEvent('demo', 'opened')).toBe('queued')
    expect(readQueue()).toEqual([{ id: 'demo', type: 'opened' }])
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })))
    expect(await flushQueue()).toBe(1)
    expect(readQueue()).toEqual([])
  })

  it('keeps a beacon queued while a flush is in flight', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await postEvent('race', 'opened')
    let release: (res: Response) => void = () => {}
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (JSON.parse(String(init.body)).type === 'opened') return new Promise<Response>((r) => (release = r))
        throw new Error(`offline ${url}`)
      }),
    )
    const flushing = flushQueue()
    expect(await postEvent('race', 'goal_reached')).toBe('queued')
    release(new Response(null, { status: 204 }))
    expect(await flushing).toBe(1)
    expect(readQueue()).toEqual([{ id: 'race', type: 'goal_reached' }])
  })

  it('keeps going when storage throws', async () => {
    vi.stubGlobal('localStorage', throwingStorage())
    vi.stubGlobal('sessionStorage', throwingStorage())
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 500 })))
    await expect(postEvent('storage-off', 'goal_reached')).resolves.toBe('queued')
    expect(goalMarked('storage-off')).toBe(true)
    await expect(flushQueue()).resolves.toBe(0)
  })

  it('does not fire for crawlers or prerender', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetch)
    expect(isCrawler({ userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' })).toBe(true)
    expect(isCrawler({ userAgent: 'facebookexternalhit/1.1' })).toBe(true)
    expect(isCrawler({ userAgent: 'Mozilla/5.0 (compatible; Linespider/1.1)' })).toBe(true)
    expect(isCrawler({ userAgent: HUMAN })).toBe(false)
    expect(isCrawler({ userAgent: 'Mozilla/5.0 (Linux; Android 12; CUBOT Note 30) Chrome/120 Mobile' })).toBe(false)
    expect(isCrawler({ userAgent: 'Mozilla/5.0 (iPhone) Instagram 300.0.0' })).toBe(false)
    expect(isCrawler({ userAgent: HUMAN, visibilityState: 'prerender' })).toBe(true)
    vi.stubGlobal('navigator', { userAgent: 'Twitterbot/1.0' })
    expect(await postEvent('demo', 'opened')).toBe('skipped')
    expect(await flushQueue()).toBe(0)
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gates the letter on the goal flag and falls back to the bundled letter', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    await expect(fetchReveal('demo')).rejects.toThrow('goal required')
    await postEvent('demo', 'goal_reached')
    const reveal = await fetchReveal('demo')
    expect(reveal.letter.body).toContain('健太')
  })
})
