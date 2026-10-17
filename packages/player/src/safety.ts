import type { ReportReasonId, ThanksStampId } from '@gfy/schema'

/**
 * F3-05 / F3-09 / F3-12 calls from the recipient's side: report, block, thank-you stamp, and the
 * operator's e-gift allowlist. None of them carries a name or a cookie; the viewer key is a random
 * value kept in this browser so a block can follow the sender's later gifts here.
 */

const VIEWER_KEY = 'gfy-viewer'
let memoryViewer: string | null = null

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function viewerKey(store: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocal()): string {
  try {
    const existing = store?.getItem(VIEWER_KEY)
    if (existing && /^[A-Za-z0-9_-]{22,64}$/.test(existing)) return existing
    const key = randomKey()
    store?.setItem(VIEWER_KEY, key)
    if (store) return key
  } catch {
    // fall through to a key for this page only
  }
  memoryViewer ??= randomKey()
  return memoryViewer
}

function safeLocal(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

async function postJson(path: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'omit',
    })
  } catch {
    return null
  }
}

export type SendResult = 'ok' | 'busy' | 'failed'

export async function sendReport(id: string, reason: ReportReasonId, detail: string): Promise<SendResult> {
  const res = await postJson(`/s/${encodeURIComponent(id)}/report`, { reason, detail })
  if (res?.status === 429) return 'busy'
  return res?.ok ? 'ok' : 'failed'
}

export async function blockSender(id: string): Promise<SendResult> {
  const res = await postJson(`/s/${encodeURIComponent(id)}/block`, { viewer: viewerKey() })
  return res?.ok ? 'ok' : 'failed'
}

export async function sendThanks(id: string, stamp: ThanksStampId): Promise<ThanksStampId | null> {
  const res = await postJson(`/s/${encodeURIComponent(id)}/thanks`, { stamp })
  if (!res?.ok) return null
  const body = (await res.json().catch(() => null)) as { stamp?: ThanksStampId } | null
  return body?.stamp ?? stamp
}

const thanksKey = (id: string) => `gfy-thanks-${id}`

export function sentThanks(id: string): ThanksStampId | null {
  try {
    return (safeLocal()?.getItem(thanksKey(id)) as ThanksStampId | null) ?? null
  } catch {
    return null
  }
}

export function rememberThanks(id: string, stamp: ThanksStampId) {
  try {
    safeLocal()?.setItem(thanksKey(id), stamp)
  } catch {
    // the server keeps the stamp either way
  }
}

/** Operator-added e-gift domains. Failing to load only means more warnings, never fewer. */
export async function fetchAllowedDomains(): Promise<string[]> {
  try {
    const res = await fetch('/s/egift-domains', { credentials: 'omit' })
    if (!res.ok) return []
    const body = (await res.json()) as { domains?: unknown }
    return Array.isArray(body.domains) ? body.domains.filter((d): d is string => typeof d === 'string') : []
  } catch {
    return []
  }
}

export const LINKS = {
  terms: '/legal/terms',
  privacy: '/legal/privacy',
  support: '/support',
  removal: '/legal/removal',
} as const
