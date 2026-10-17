import { DIFFICULTIES, GIFT_ITEMS, templateById } from '@gfy/catalog'
import { checkEgiftUrl, LIMITS, sanitizeDisplay, textLength, type Difficulty } from '@gfy/schema'

export type DraftCoin = {
  /** Also the server-side photo ref; a new photo gets a new ref so stale uploads never match. */
  photoRef: string
  width: number
  height: number
  message: string
}

export type EgiftDraft =
  | { kind: 'none' }
  | { kind: 'url'; url: string; acceptOffList: boolean }
  | { kind: 'code'; code: string }

export type Draft = {
  version: 1
  updatedAt: number
  templateId: string | null
  difficulty: Difficulty | null
  coins: DraftCoin[]
  itemId: string | null
  itemLabel: string
  fromName: string
  toName: string
  letter: string
  egift: EgiftDraft
  passphrase: string
  /** Server draft that photos were uploaded to, reused across publish attempts. */
  serverGiftId: string | null
}

export function emptyDraft(now = Date.now()): Draft {
  return {
    version: 1,
    updatedAt: now,
    templateId: null,
    difficulty: null,
    coins: [],
    itemId: null,
    itemLabel: '',
    fromName: '',
    toName: '',
    letter: '',
    egift: { kind: 'none' },
    passphrase: '',
    serverGiftId: null,
  }
}

export type DraftAction =
  | { type: 'reset'; draft?: Draft }
  | { type: 'template'; templateId: string }
  | { type: 'difficulty'; difficulty: Difficulty }
  | { type: 'addCoin'; coin: DraftCoin }
  | { type: 'replacePhoto'; index: number; photoRef: string; width: number; height: number }
  | { type: 'removeCoin'; index: number }
  | { type: 'moveCoin'; from: number; to: number }
  | { type: 'coinMessage'; index: number; message: string }
  | { type: 'item'; itemId: string }
  | { type: 'itemLabel'; label: string }
  | { type: 'names'; fromName?: string; toName?: string }
  | { type: 'letter'; letter: string }
  | { type: 'egift'; egift: EgiftDraft }
  | { type: 'passphrase'; passphrase: string }
  | { type: 'serverGift'; giftId: string | null }

/** Cuts input at a code-point limit so a form can never hold more than the parser accepts. */
export function clip(value: string, max: number): string {
  const chars = [...value]
  return chars.length > max ? chars.slice(0, max).join('') : value
}

export function coinLimit(draft: Pick<Draft, 'templateId'>): number {
  const template = draft.templateId ? templateById(draft.templateId) : undefined
  return Math.min(template?.coinSlots ?? LIMITS.coins, LIMITS.coins)
}

function update(draft: Draft, patch: Partial<Draft>, now: number): Draft {
  return { ...draft, ...patch, updatedAt: now }
}

export function reduceDraft(draft: Draft, action: DraftAction, now = Date.now()): Draft {
  switch (action.type) {
    case 'reset':
      return action.draft ?? emptyDraft(now)
    case 'template': {
      const next = update(draft, { templateId: action.templateId }, now)
      return { ...next, coins: next.coins.slice(0, coinLimit(next)) }
    }
    case 'difficulty':
      return update(draft, { difficulty: action.difficulty }, now)
    case 'addCoin':
      if (draft.coins.length >= coinLimit(draft)) return draft
      return update(draft, { coins: [...draft.coins, { ...action.coin, message: clip(action.coin.message, LIMITS.coinMessage) }] }, now)
    case 'replacePhoto':
      return update(
        draft,
        {
          coins: draft.coins.map((coin, i) =>
            i === action.index ? { ...coin, photoRef: action.photoRef, width: action.width, height: action.height } : coin,
          ),
        },
        now,
      )
    case 'removeCoin':
      return update(draft, { coins: draft.coins.filter((_, i) => i !== action.index) }, now)
    case 'moveCoin': {
      const { from, to } = action
      if (from < 0 || from >= draft.coins.length || to < 0 || to >= draft.coins.length || from === to) return draft
      const coins = [...draft.coins]
      const [moved] = coins.splice(from, 1)
      coins.splice(to, 0, moved)
      return update(draft, { coins }, now)
    }
    case 'coinMessage':
      return update(
        draft,
        { coins: draft.coins.map((coin, i) => (i === action.index ? { ...coin, message: clip(action.message, LIMITS.coinMessage) } : coin)) },
        now,
      )
    case 'item': {
      const item = GIFT_ITEMS.find((entry) => entry.id === action.itemId)
      if (!item) return draft
      // Picking an item fills its name until the sender writes their own.
      const label = draft.itemLabel && !GIFT_ITEMS.some((entry) => entry.name === draft.itemLabel) ? draft.itemLabel : item.name
      return update(draft, { itemId: item.id, itemLabel: label }, now)
    }
    case 'itemLabel':
      return update(draft, { itemLabel: clip(action.label, LIMITS.giftLabel) }, now)
    case 'names':
      return update(
        draft,
        {
          fromName: action.fromName === undefined ? draft.fromName : clip(action.fromName, LIMITS.displayName),
          toName: action.toName === undefined ? draft.toName : clip(action.toName, LIMITS.displayName),
        },
        now,
      )
    case 'letter':
      return update(draft, { letter: clip(action.letter, LIMITS.letter) }, now)
    case 'egift': {
      const egift = action.egift.kind === 'code' ? { ...action.egift, code: clip(action.egift.code, LIMITS.egiftCode) } : action.egift
      // A passphrase only guards an e-gift; dropping the e-gift drops it too.
      return update(draft, { egift, passphrase: egift.kind === 'none' ? '' : draft.passphrase }, now)
    }
    case 'passphrase':
      return update(draft, { passphrase: clip(action.passphrase, LIMITS.passphraseMax) }, now)
    case 'serverGift':
      return update(draft, { serverGiftId: action.giftId }, now)
  }
}

export type Step = 'template' | 'obstacles' | 'coins' | 'item' | 'letter' | 'egift'

export const STEPS: readonly { id: Step; title: string }[] = [
  { id: 'template', title: 'コース' },
  { id: 'obstacles', title: 'むずかしさ' },
  { id: 'coins', title: '思い出コイン' },
  { id: 'item', title: 'プレゼント' },
  { id: 'letter', title: '手紙' },
  { id: 'egift', title: 'eギフト' },
]

const filled = (value: string) => textLength(sanitizeDisplay(value).trim()) > 0

export type EgiftAssessment =
  | { status: 'none' }
  | { status: 'ok'; domain?: string }
  | { status: 'warn'; domain: string }
  | { status: 'block'; message: string }

let operatorDomains: readonly string[] = []

/** E-gift domains the operator allowed on top of the built-in list (GET /s/egift-domains). */
export function setExtraDomains(domains: readonly string[]) {
  operatorDomains = domains
}

export function assessEgift(egift: EgiftDraft): EgiftAssessment {
  if (egift.kind === 'none') return { status: 'none' }
  if (egift.kind === 'code') {
    return filled(egift.code) ? { status: 'ok' } : { status: 'block', message: 'コードを入れてください' }
  }
  const url = egift.url.trim()
  if (!url) return { status: 'block', message: 'URLを入れてください' }
  const check = checkEgiftUrl(url, operatorDomains)
  if (check.status === 'block') {
    return {
      status: 'block',
      message: check.reason === 'shortener' ? '短縮URLは使えません。元のURLを入れてください' : 'https:// から始まるURLだけ使えます',
    }
  }
  return check.status === 'warn' ? { status: 'warn', domain: check.domain } : { status: 'ok', domain: check.domain }
}

/** What still blocks a step, in words the sender can act on. Empty means done. */
export function stepIssues(draft: Draft, step: Step): string[] {
  switch (step) {
    case 'template':
      return draft.templateId && templateById(draft.templateId) ? [] : ['コースを選んでください']
    case 'obstacles':
      return draft.difficulty && DIFFICULTIES.some((entry) => entry.id === draft.difficulty) ? [] : ['むずかしさを選んでください']
    case 'coins': {
      const issues: string[] = []
      if (draft.coins.length === 0) issues.push('写真を1枚以上えらんでください')
      if (draft.coins.length > coinLimit(draft)) issues.push(`コインは${coinLimit(draft)}枚までです`)
      return issues
    }
    case 'item': {
      const issues: string[] = []
      if (!draft.itemId) issues.push('プレゼントを選んでください')
      if (!filled(draft.itemLabel)) issues.push('プレゼントの名前を入れてください')
      return issues
    }
    case 'letter': {
      const issues: string[] = []
      if (!filled(draft.toName)) issues.push('だれへ（相手の名前）を入れてください')
      if (!filled(draft.fromName)) issues.push('だれから（あなたの名前）を入れてください')
      if (!filled(draft.letter)) issues.push('手紙を書いてください')
      return issues
    }
    case 'egift': {
      const assessment = assessEgift(draft.egift)
      const issues: string[] = []
      if (assessment.status === 'block') issues.push(assessment.message)
      if (assessment.status === 'warn' && draft.egift.kind === 'url' && !draft.egift.acceptOffList) {
        issues.push(`${assessment.domain} は確認リストにないサイトです。確かめてからチェックを入れてください`)
      }
      const length = textLength(draft.passphrase)
      if (draft.passphrase && (length < LIMITS.passphraseMin || length > LIMITS.passphraseMax)) {
        issues.push(`合言葉は${LIMITS.passphraseMin}〜${LIMITS.passphraseMax}文字です`)
      }
      return issues
    }
  }
}

export function draftIssues(draft: Draft): string[] {
  return STEPS.flatMap((step) => stepIssues(draft, step.id))
}

export function isStarted(draft: Draft): boolean {
  return draft.templateId !== null || draft.coins.length > 0 || filled(draft.letter)
}

export function newPhotoRef(random: () => string): string {
  return `p-${random().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12)}`
}
