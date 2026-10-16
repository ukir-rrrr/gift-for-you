import { SAMPLE_REVEALS, SAMPLE_SHARES } from '@gfy/catalog'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isPreviewPath, previewSource, resolveGift, waitForPreview } from '../src/source'

const photo = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQ=='

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('previewSource', () => {
  it('serves local photos and the reveal without beacons', async () => {
    const source = previewSource({ share: SAMPLE_SHARES.demo, reveal: SAMPLE_REVEALS.demo, photos: { 'photo-1': photo } })
    expect(source?.preview).toBe(true)
    expect(source?.photoUrl('photo-1')).toBe(photo)
    expect(source?.photoUrl('missing-photo')).toBe('/assets/photos/placeholder.png')
    expect((await source!.reveal()).letter.body).toContain('彩へ')
  })

  it('drops photos that are not jpeg data urls', () => {
    const source = previewSource({
      share: SAMPLE_SHARES.demo,
      reveal: SAMPLE_REVEALS.demo,
      photos: { 'photo-1': 'https://tracker.example/p.jpg', 'photo-2': 'data:image/svg+xml;base64,PHN2Zz4=' },
    })
    expect(source?.photoUrl('photo-1')).toBe('/assets/photos/placeholder.png')
    expect(source?.photoUrl('photo-2')).toBe('/assets/photos/placeholder.png')
  })

  it('rejects a share or reveal the parser rejects', () => {
    expect(previewSource({ share: { ...SAMPLE_SHARES.demo, schemaVersion: 2 }, reveal: SAMPLE_REVEALS.demo })).toBeNull()
    expect(previewSource({ share: SAMPLE_SHARES.demo, reveal: { letter: { body: '' } } })).toBeNull()
  })

  it('locks the e-gift behind the passphrase and checks it locally', async () => {
    const source = previewSource({ share: SAMPLE_SHARES.demo, reveal: SAMPLE_REVEALS.demo, passphrase: 'ひみつ' })!
    expect((await source.reveal()).egift).toEqual({ kind: 'url', locked: true })
    expect(await source.unlock('ちがう')).toEqual({ ok: false, reason: 'wrong' })
    const opened = await source.unlock('ひみつ')
    expect(opened.ok && opened.egift.url).toBe('https://giftee.com/cards/demo')
  })
})

describe('isPreviewPath', () => {
  it('matches only /preview', () => {
    expect(isPreviewPath('/preview')).toBe(true)
    expect(isPreviewPath('/preview/')).toBe(true)
    expect(isPreviewPath('/g/preview')).toBe(false)
  })
})

describe('waitForPreview', () => {
  it('uses the payload the native WebView injected', async () => {
    const payload = { share: 1, reveal: 2 }
    const win = { __GFY_PREVIEW__: payload } as unknown as Window
    await expect(waitForPreview(win)).resolves.toBe(payload)
  })

  it('asks the parent frame and accepts only its message', async () => {
    const listeners: ((event: MessageEvent) => void)[] = []
    const parent = { postMessage: vi.fn() }
    const win = {
      parent,
      addEventListener: (_: string, fn: (event: MessageEvent) => void) => listeners.push(fn),
    } as unknown as Window
    const waiting = waitForPreview(win)
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'gfy-preview-ready' }, '*')
    listeners[0]({ source: {}, data: { type: 'gfy-preview', payload: { share: 'evil' } } } as MessageEvent)
    listeners[0]({ source: parent, data: { type: 'gfy-preview', payload: { share: 'ok' } } } as unknown as MessageEvent)
    await expect(waiting).resolves.toEqual({ share: 'ok' })
  })
})

describe('resolveGift', () => {
  it('fetches a published gift and points photos at the server', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ...SAMPLE_SHARES.demo, expiresAt: '2099-01-01T00:00:00Z' })))
    vi.stubGlobal('fetch', fetchMock)
    const source = await resolveGift('Ab3dEf7hJk')
    expect(fetchMock).toHaveBeenCalledWith('/s/Ab3dEf7hJk/share', { credentials: 'omit' })
    expect(source?.preview).toBe(false)
    expect(source?.photoUrl('p-1')).toBe('/s/Ab3dEf7hJk/photos/p-1')
  })

  it('returns null for missing, malformed, and expired gifts', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 404 })))
    expect(await resolveGift('nope')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not json')))
    expect(await resolveGift('nope')).toBeNull()
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...SAMPLE_SHARES.demo, expiresAt: '2001-01-01T00:00:00Z' }))))
    expect(await resolveGift('old')).toBeNull()
    expect(await resolveGift('expired')).toBeNull()
  })

  it('posts the passphrase and returns the unlocked e-gift', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ...SAMPLE_SHARES.demo }))))
    const source = (await resolveGift('Ab3dEf7hJk'))!
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kind: 'code', code: 'GIFT-1234' }))))
    expect(await source.unlock('ひみつ')).toEqual({ ok: true, egift: { kind: 'code', code: 'GIFT-1234' } })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 429 })))
    expect(await source.unlock('ひみつ')).toEqual({ ok: false, reason: 'busy' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 403 })))
    expect(await source.unlock('ひみつ')).toEqual({ ok: false, reason: 'wrong' })
  })
})
