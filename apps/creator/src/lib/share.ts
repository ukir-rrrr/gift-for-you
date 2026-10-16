import { CATALOG_VERSION, catalogIndex } from '@gfy/catalog'
import { parseRevealJson, parseShareJson, type RevealJson, type ShareJson } from '@gfy/schema'
import { assessEgift, draftIssues, type Draft } from './draft'

export type GiftContent = { share: ShareJson; reveal: RevealJson; passphrase: string | null }

export type BuildResult = { ok: true; value: GiftContent } | { ok: false; issues: string[] }

/** Turns a finished draft into Share JSON v1 and Reveal JSON, checked by the same parsers the player uses. */
export function buildContent(draft: Draft): BuildResult {
  const issues = draftIssues(draft)
  if (issues.length > 0) return { ok: false, issues }
  const difficulty = draft.difficulty!
  const index = catalogIndex()
  const assessment = assessEgift(draft.egift)
  const egift = draft.egift
  const shareInput = {
    schemaVersion: 1,
    mode: 'platformer',
    catalogVersion: CATALOG_VERSION,
    locale: 'ja',
    from: { displayName: draft.fromName.trim() },
    to: { displayName: draft.toName.trim() },
    course: {
      templateId: draft.templateId,
      difficulty,
      obstaclePresets: [...index.presetsByDifficulty[difficulty]],
      assist: { autoAssistAfterFails: 3, easyModeDefault: false },
    },
    memoryCoins: draft.coins.map((coin, i) => ({ order: i + 1, photoRef: coin.photoRef, message: coin.message.trim() })),
    goal: {
      revealEffectId: index.revealIds[0],
      giftItem: { itemId: draft.itemId, label: draft.itemLabel.trim() },
      letter: { present: true },
      egift:
        egift.kind === 'none'
          ? { present: false }
          : {
              present: true,
              kind: egift.kind,
              ...(assessment.status === 'ok' || assessment.status === 'warn' ? (assessment.domain ? { domain: assessment.domain } : {}) : {}),
              passphrase: draft.passphrase.length > 0,
            },
    },
  }
  const revealInput = {
    letter: { body: draft.letter.trim() },
    ...(egift.kind === 'url' ? { egift: { kind: 'url', url: egift.url.trim() } } : {}),
    ...(egift.kind === 'code' ? { egift: { kind: 'code', code: egift.code.trim() } } : {}),
  }
  const share = parseShareJson(shareInput, index)
  if (!share.ok) return { ok: false, issues: share.issues }
  const reveal = parseRevealJson(revealInput)
  if (!reveal.ok) return { ok: false, issues: reveal.issues }
  return { ok: true, value: { share: share.value, reveal: reveal.value, passphrase: draft.passphrase || null } }
}

export type PreviewPayload = {
  share: ShareJson
  reveal: RevealJson
  photos: Record<string, string>
  passphrase?: string
}

export function previewPayload(content: GiftContent, photos: Record<string, string>): PreviewPayload {
  return {
    share: content.share,
    reveal: content.reveal,
    photos,
    ...(content.passphrase ? { passphrase: content.passphrase } : {}),
  }
}

/** JS that hands the payload to the player before its scripts run (native WebView). */
export function previewInjection(payload: PreviewPayload): string {
  const json = JSON.stringify(payload).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')
  return `window.__GFY_PREVIEW__ = ${json}; true;`
}
