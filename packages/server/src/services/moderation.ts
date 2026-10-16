import { bytesToBase64 } from '@gfy/imaging'

export type Verdict = { ok: true } | { ok: false; reason: string }

/** Thrown when the moderation service cannot answer. Callers fail closed (503) instead of approving. */
export class ModerationUnavailable extends Error {}

export interface Moderator {
  image(bytes: Uint8Array): Promise<Verdict>
  text(value: string): Promise<Verdict>
}

const IMAGE_MARKER = new TextEncoder().encode('GFY-NG')
const TEXT_MARKERS = ['NGWORD']

function contains(haystack: Uint8Array, needle: Uint8Array): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i += 1) {
    for (let j = 0; j < needle.length; j += 1) if (haystack[i + j] !== needle[j]) continue outer
    return true
  }
  return false
}

/** Deterministic stand-in: rejects images that carry the bytes GFY-NG and text that contains NGWORD. */
export class MockModerator implements Moderator {
  async image(bytes: Uint8Array): Promise<Verdict> {
    return contains(bytes, IMAGE_MARKER) ? { ok: false, reason: 'flagged' } : { ok: true }
  }

  async text(value: string): Promise<Verdict> {
    return TEXT_MARKERS.some((marker) => value.includes(marker)) ? { ok: false, reason: 'flagged' } : { ok: true }
  }
}

const LIKELIHOOD = ['UNKNOWN', 'VERY_UNLIKELY', 'UNLIKELY', 'POSSIBLE', 'LIKELY', 'VERY_LIKELY'] as const
type Likelihood = (typeof LIKELIHOOD)[number]

/** Minimum likelihood that rejects a photo, per SafeSearch category. Gifts are seen by anyone with the link. */
export const SAFE_SEARCH_LIMITS: Record<'adult' | 'violence' | 'racy', Likelihood> = {
  adult: 'POSSIBLE',
  violence: 'LIKELY',
  racy: 'LIKELY',
}

function atLeast(value: unknown, limit: Likelihood): boolean {
  const index = LIKELIHOOD.indexOf(value as Likelihood)
  return index >= LIKELIHOOD.indexOf(limit)
}

/**
 * Words that keep a gift from being published. A short starter list: the operator should replace it
 * with a maintained list before launch (docs/phase3.md). Matching ignores case and full/half width.
 */
export const BLOCKED_WORDS = ['死ね', 'しね', '殺す', 'ころす', 'きもい', 'ブス', 'NGWORD']

function fold(value: string): string {
  return value.normalize('NFKC').toLowerCase().replace(/\s+/g, '')
}

export class WordListModerator {
  constructor(private readonly words: readonly string[] = BLOCKED_WORDS) {}

  async text(value: string): Promise<Verdict> {
    const folded = fold(value)
    return this.words.some((word) => folded.includes(fold(word))) ? { ok: false, reason: 'blocked_word' } : { ok: true }
  }
}

type Fetch = typeof fetch

/**
 * F3-04: Google Cloud Vision SafeSearch for photos, the word list for text. Any error (network,
 * quota, a malformed answer) throws ModerationUnavailable, so nothing is approved by accident.
 */
export class VisionModerator implements Moderator {
  private readonly words = new WordListModerator()

  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {
    if (!apiKey) throw new ModerationUnavailable('GOOGLE_VISION_API_KEY is not set')
  }

  async image(bytes: Uint8Array): Promise<Verdict> {
    let res: Response
    try {
      res = await this.fetchImpl('https://vision.googleapis.com/v1/images:annotate', {
        method: 'POST',
        // The key goes in a header, not the URL, so it never lands in request logs.
        headers: { 'content-type': 'application/json', 'x-goog-api-key': this.apiKey },
        body: JSON.stringify({
          requests: [{ image: { content: bytesToBase64(bytes) }, features: [{ type: 'SAFE_SEARCH_DETECTION' }] }],
        }),
      })
    } catch {
      throw new ModerationUnavailable('vision unreachable')
    }
    if (!res.ok) throw new ModerationUnavailable(`vision ${res.status}`)
    const body = (await res.json().catch(() => null)) as {
      responses?: { safeSearchAnnotation?: Record<string, unknown>; error?: unknown }[]
    } | null
    const answer = body?.responses?.[0]
    if (!answer || answer.error || !answer.safeSearchAnnotation) throw new ModerationUnavailable('vision answer')
    for (const [category, limit] of Object.entries(SAFE_SEARCH_LIMITS)) {
      if (atLeast(answer.safeSearchAnnotation[category], limit)) return { ok: false, reason: category }
    }
    return { ok: true }
  }

  text(value: string): Promise<Verdict> {
    return this.words.text(value)
  }
}
