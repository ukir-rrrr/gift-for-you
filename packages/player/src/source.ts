import { catalogIndex } from '@gfy/catalog'
import { isExpired, parseRevealJson, parseShareJson, type ShareJson } from '@gfy/schema'
import { fetchReveal, type Reveal } from './net'
import { loadGift } from './route'
import { viewerKey } from './safety'

export type Egift = NonNullable<Reveal['egift']>

export type UnlockResult = { ok: true; egift: Egift } | { ok: false; reason: 'wrong' | 'busy' | 'offline' }

/** Where one gift's data comes from: a bundled sample, the gift server, or the creator's local preview. */
export type GiftSource = {
  id: string
  share: ShareJson
  /** Preview never sends beacons and never navigates to the e-gift. */
  preview: boolean
  photoUrl(ref: string): string
  reveal(): Promise<Reveal>
  unlock(passphrase: string): Promise<UnlockResult>
}

const PREVIEW_ID = '__preview__'

export function isPreviewPath(pathname: string): boolean {
  return pathname === '/preview' || pathname === '/preview/'
}

async function postUnlock(id: string, passphrase: string): Promise<UnlockResult> {
  try {
    const res = await fetch(`/s/${encodeURIComponent(id)}/unlock`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-gfy-viewer': viewerKey() },
      body: JSON.stringify({ passphrase }),
      credentials: 'omit',
    })
    if (res.status === 429) return { ok: false, reason: 'busy' }
    if (!res.ok) return { ok: false, reason: 'wrong' }
    const parsed = parseRevealJson({ letter: { body: '-' }, egift: await res.json() })
    if (!parsed.ok || !parsed.value.egift || parsed.value.egift.locked) return { ok: false, reason: 'wrong' }
    return { ok: true, egift: parsed.value.egift }
  } catch {
    return { ok: false, reason: 'offline' }
  }
}

function sampleSource(id: string, share: ShareJson): GiftSource {
  return {
    id,
    share,
    preview: false,
    photoUrl: (ref) => `/assets/photos/${ref}.png`,
    reveal: () => fetchReveal(id),
    unlock: (passphrase) => postUnlock(id, passphrase),
  }
}

function remoteSource(id: string, share: ShareJson): GiftSource {
  const base = `/s/${encodeURIComponent(id)}`
  return {
    id,
    share,
    preview: false,
    photoUrl: (ref) => `${base}/photos/${encodeURIComponent(ref)}`,
    reveal: () => fetchReveal(id, viewerKey()),
    unlock: (passphrase) => postUnlock(id, passphrase),
  }
}

/**
 * Bundled samples resolve without a request; anything else asks the gift server. "blocked" means
 * this browser blocked the gift's sender (F3-12).
 */
export async function resolveGiftFor(id: string, viewer: string | undefined, now = new Date()): Promise<GiftSource | 'blocked' | null> {
  const sample = loadGift(id, now)
  if (sample.ok) return sampleSource(sample.id, sample.share)
  if (id === 'demo' || id === 'offlist' || id === 'expired') return null
  try {
    const init: RequestInit = viewer ? { credentials: 'omit', headers: { 'x-gfy-viewer': viewer } } : { credentials: 'omit' }
    const res = await fetch(`/s/${encodeURIComponent(id)}/share`, init)
    if (res.status === 403 && ((await res.json().catch(() => null)) as { error?: string } | null)?.error === 'blocked') return 'blocked'
    if (!res.ok) return null
    const parsed = parseShareJson(await res.json(), catalogIndex())
    if (!parsed.ok || isExpired(parsed.value, now)) return null
    return remoteSource(id, parsed.value)
  } catch {
    return null
  }
}

/** Same as resolveGiftFor without a viewer key: a block never applies. */
export async function resolveGift(id: string, now = new Date()): Promise<GiftSource | null> {
  const source = await resolveGiftFor(id, undefined, now)
  return source === 'blocked' ? null : source
}

export type PreviewPayload = {
  share: unknown
  reveal: unknown
  /** photoRef to a base64 JPEG data URL, already resized and stripped on the device. */
  photos?: Record<string, unknown>
  passphrase?: unknown
}

const JPEG_DATA_URL = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/

/** Validates a preview payload as strictly as a published gift. Photos must be JPEG data URLs. */
export function previewSource(payload: PreviewPayload): GiftSource | null {
  const share = parseShareJson(payload.share, catalogIndex())
  if (!share.ok) return null
  const reveal = parseRevealJson(payload.reveal)
  if (!reveal.ok) return null
  const photos = new Map<string, string>()
  for (const [ref, url] of Object.entries(payload.photos ?? {})) {
    if (typeof url === 'string' && JPEG_DATA_URL.test(url)) photos.set(ref, url)
  }
  const passphrase = typeof payload.passphrase === 'string' ? payload.passphrase : ''
  const egift = reveal.value.egift
  const locked = Boolean(passphrase && egift)
  return {
    id: PREVIEW_ID,
    share: share.value,
    preview: true,
    photoUrl: (ref) => photos.get(ref) ?? '/assets/photos/placeholder.png',
    reveal: async () => (locked && egift ? { ...reveal.value, egift: { kind: egift.kind, locked: true } } : reveal.value),
    unlock: async (attempt) =>
      egift && attempt === passphrase ? { ok: true, egift: { ...egift, locked: false } } : { ok: false, reason: 'wrong' },
  }
}

type PreviewWindow = Window & {
  __GFY_PREVIEW__?: PreviewPayload
  ReactNativeWebView?: { postMessage(message: string): void }
}

/**
 * The creator app hands the payload over in one of two ways: the native WebView injects
 * window.__GFY_PREVIEW__ before the page loads, and the web build posts it from the parent frame.
 */
export function waitForPreview(win: PreviewWindow = window as PreviewWindow): Promise<PreviewPayload> {
  if (win.__GFY_PREVIEW__) return Promise.resolve(win.__GFY_PREVIEW__)
  return new Promise((resolve) => {
    win.addEventListener('message', (event: MessageEvent) => {
      if (win.parent === win || event.source !== win.parent) return
      const data = event.data as { type?: unknown; payload?: unknown } | null
      if (data?.type === 'gfy-preview' && data.payload && typeof data.payload === 'object') {
        resolve(data.payload as PreviewPayload)
      }
    })
    const ready = { type: 'gfy-preview-ready' }
    if (win.parent !== win) win.parent.postMessage(ready, '*')
    win.ReactNativeWebView?.postMessage(JSON.stringify(ready))
  })
}
