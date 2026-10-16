export type Verdict = { ok: true } | { ok: false; reason: string }

/**
 * Production needs a real provider (for example a hosted image-safety API). It is not wired in
 * this tree because it needs an account and an API key; see docs/phase2.md.
 */
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
