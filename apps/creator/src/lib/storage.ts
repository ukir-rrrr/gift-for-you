import { base64ToBytes, bytesToBase64, jpegDataUrl } from '@gfy/imaging'
import { emptyDraft, type Draft } from './draft'

/** The subset of AsyncStorage this app uses, so tests can pass a Map. */
export interface KV {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
  getAllKeys(): Promise<readonly string[]>
}

const DRAFT_KEY = 'gfy:draft:v1'
const PHOTO_PREFIX = 'gfy:photo:'
const HISTORY_KEY = 'gfy:history:v1'
const HISTORY_MAX = 50

export async function loadDraft(kv: KV): Promise<Draft | null> {
  try {
    const raw = await kv.getItem(DRAFT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Draft>
    if (parsed?.version !== 1) return null
    // Fill fields a newer build may have added since the draft was saved.
    const base = emptyDraft(0)
    return { ...base, ...parsed, coins: Array.isArray(parsed.coins) ? parsed.coins : [], egift: parsed.egift ?? base.egift } as Draft
  } catch {
    return null
  }
}

export async function saveDraft(kv: KV, draft: Draft): Promise<void> {
  await kv.setItem(DRAFT_KEY, JSON.stringify(draft))
}

/** Photos live under their own keys so the draft JSON stays small. Stored already resized and stripped. */
export async function savePhoto(kv: KV, ref: string, jpeg: Uint8Array): Promise<void> {
  await kv.setItem(PHOTO_PREFIX + ref, bytesToBase64(jpeg))
}

export async function loadPhoto(kv: KV, ref: string): Promise<Uint8Array | null> {
  const raw = await kv.getItem(PHOTO_PREFIX + ref)
  return raw ? base64ToBytes(raw) : null
}

export async function photoDataUrl(kv: KV, ref: string): Promise<string | null> {
  const bytes = await loadPhoto(kv, ref)
  return bytes ? jpegDataUrl(bytes) : null
}

/** Removes stored photos no coin points at any more (replaced or deleted coins). */
export async function prunePhotos(kv: KV, keep: readonly string[]): Promise<number> {
  const keys = await kv.getAllKeys()
  const stale = keys.filter((key) => key.startsWith(PHOTO_PREFIX) && !keep.includes(key.slice(PHOTO_PREFIX.length)))
  for (const key of stale) await kv.removeItem(key)
  return stale.length
}

export async function clearDraft(kv: KV): Promise<void> {
  await kv.removeItem(DRAFT_KEY)
  await prunePhotos(kv, [])
}

export type LocalGift = {
  giftId: string
  shareId: string
  url: string
  revokeUrl: string
  toName: string
  expiresAt: string
  publishedAt: number
}

export async function loadHistory(kv: KV): Promise<LocalGift[]> {
  try {
    const raw = await kv.getItem(HISTORY_KEY)
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(parsed) ? (parsed as LocalGift[]) : []
  } catch {
    return []
  }
}

export async function addHistory(kv: KV, gift: LocalGift): Promise<void> {
  const list = (await loadHistory(kv)).filter((entry) => entry.giftId !== gift.giftId)
  await kv.setItem(HISTORY_KEY, JSON.stringify([gift, ...list].slice(0, HISTORY_MAX)))
}

export function memoryKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>()
  return {
    data,
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => void data.set(key, value),
    removeItem: async (key) => void data.delete(key),
    getAllKeys: async () => [...data.keys()],
  }
}
