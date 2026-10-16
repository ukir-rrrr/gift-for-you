import { catalogIndex, SAMPLE_SHARES } from '@gfy/catalog'
import { isExpired, parseShareJson, sanitizeDisplay, type ShareJson } from '@gfy/schema'

export type Flags = {
  e2e: boolean
  easy: boolean
  rec: boolean
  walk: 6 | 8 | null
  difficulty: 'easy' | 'normal' | 'hard' | null
}

function decodeGiftId(raw: string): string | null {
  try {
    const id = decodeURIComponent(raw)
    return id.length > 0 ? id : null
  } catch {
    return null
  }
}

export function giftIdFromLocation(loc: { pathname: string; hash: string }): string | null {
  const hashPath = loc.hash.replace(/^#/, '')
  const path = hashPath.startsWith('/g/') ? hashPath : loc.pathname
  if (path === '/' || path === '') return 'demo'
  const match = path.match(/\/g\/([^/]+)\/?$/)
  return match ? decodeGiftId(match[1]) : null
}

export function readFlags(search: string): Flags {
  const params = new URLSearchParams(search)
  const walk = params.get('walk')
  const difficulty = params.get('difficulty')
  return {
    e2e: params.get('e2e') === '1',
    easy: params.get('easy') === '1',
    rec: params.get('rec') === '1',
    walk: walk === '8' ? 8 : walk === '6' ? 6 : null,
    difficulty: difficulty === 'easy' || difficulty === 'normal' || difficulty === 'hard' ? difficulty : null,
  }
}

export function loadGift(id: string, now = new Date()): { ok: true; id: string; share: ShareJson } | { ok: false } {
  const raw = id === 'demo' ? SAMPLE_SHARES.demo : id === 'offlist' ? SAMPLE_SHARES.offlist : id === 'expired' ? SAMPLE_SHARES.expired : null
  if (!raw) return { ok: false }
  const parsed = parseShareJson(raw, catalogIndex())
  if (!parsed.ok) return { ok: false }
  if (isExpired(parsed.value, now)) return { ok: false }
  return { ok: true, id, share: parsed.value }
}

export function recipientName(share: ShareJson): string {
  return sanitizeDisplay(share.to.displayName)
}
