import { catalogIndex, GIFT_ITEMS } from '@gfy/catalog'
import { parseRevealJson, parseShareJson } from '@gfy/schema'
import { describe, expect, it } from 'vitest'
import { assessEgift, draftIssues, emptyDraft, reduceDraft, stepIssues, type Draft, type DraftAction } from '../src/lib/draft'
import { buildContent, previewInjection, previewPayload } from '../src/lib/share'

const coin = (ref: string, message = '') => ({ photoRef: ref, width: 1080, height: 810, message })

function apply(...actions: DraftAction[]): Draft {
  return actions.reduce((draft, action) => reduceDraft(draft, action, 1), emptyDraft(0))
}

function complete(...extra: DraftAction[]): Draft {
  return apply(
    { type: 'template', templateId: 'course-01' },
    { type: 'difficulty', difficulty: 'easy' },
    { type: 'addCoin', coin: coin('p-a', 'はじめての旅') },
    { type: 'addCoin', coin: coin('p-b', '雨の日') },
    { type: 'addCoin', coin: coin('p-c') },
    { type: 'item', itemId: 'mug' },
    { type: 'names', fromName: '健太', toName: '彩' },
    { type: 'letter', letter: '彩へ\nいつもありがとう' },
    ...extra,
  )
}

describe('draft reducer', () => {
  it('caps coins at the template slots and reorders them', () => {
    let draft = apply({ type: 'template', templateId: 'course-01' })
    for (const ref of ['p-1', 'p-2', 'p-3', 'p-4', 'p-5']) draft = reduceDraft(draft, { type: 'addCoin', coin: coin(ref) })
    expect(draft.coins.map((c) => c.photoRef)).toEqual(['p-1', 'p-2', 'p-3', 'p-4'])
    draft = reduceDraft(draft, { type: 'moveCoin', from: 3, to: 0 })
    expect(draft.coins.map((c) => c.photoRef)).toEqual(['p-4', 'p-1', 'p-2', 'p-3'])
    draft = reduceDraft(draft, { type: 'moveCoin', from: 0, to: 9 })
    expect(draft.coins[0].photoRef).toBe('p-4')
    draft = reduceDraft(draft, { type: 'removeCoin', index: 1 })
    expect(draft.coins.map((c) => c.photoRef)).toEqual(['p-4', 'p-2', 'p-3'])
    draft = reduceDraft(draft, { type: 'replacePhoto', index: 0, photoRef: 'p-9', width: 600, height: 800 })
    expect(draft.coins[0]).toMatchObject({ photoRef: 'p-9', width: 600, height: 800 })
  })

  it('clips text at the share limits by code point', () => {
    const draft = apply(
      { type: 'item', itemId: 'scarf' },
      { type: 'itemLabel', label: 'あ'.repeat(25) },
      { type: 'names', toName: '𠮷'.repeat(20) },
      { type: 'letter', letter: 'x'.repeat(600) },
      { type: 'egift', egift: { kind: 'code', code: 'C'.repeat(100) } },
    )
    expect([...draft.itemLabel]).toHaveLength(20)
    expect([...draft.toName]).toHaveLength(12)
    expect(draft.letter).toHaveLength(500)
    expect(draft.egift.kind === 'code' && draft.egift.code.length).toBe(80)
  })

  it('fills the item name until the sender writes their own', () => {
    let draft = apply({ type: 'item', itemId: 'scarf' })
    expect(draft.itemLabel).toBe('マフラー')
    draft = reduceDraft(draft, { type: 'item', itemId: 'mug' })
    expect(draft.itemLabel).toBe('マグカップ')
    draft = reduceDraft(draft, { type: 'itemLabel', label: 'おそろいのマグ' })
    draft = reduceDraft(draft, { type: 'item', itemId: 'book' })
    expect(draft.itemLabel).toBe('おそろいのマグ')
    expect(reduceDraft(draft, { type: 'item', itemId: 'car' })).toBe(draft)
  })

  it('offers every catalog item', () => {
    expect(catalogIndex().itemIds).toEqual(GIFT_ITEMS.map((item) => item.id))
  })

  it('drops the passphrase with the e-gift', () => {
    let draft = complete({ type: 'egift', egift: { kind: 'code', code: 'X' } }, { type: 'passphrase', passphrase: 'ひみつ' })
    expect(draft.passphrase).toBe('ひみつ')
    draft = reduceDraft(draft, { type: 'egift', egift: { kind: 'none' } })
    expect(draft.passphrase).toBe('')
  })
})

describe('step checks', () => {
  it('names what each step still needs', () => {
    const draft = emptyDraft()
    expect(stepIssues(draft, 'template')).toEqual(['コースを選んでください'])
    expect(stepIssues(draft, 'coins')).toEqual(['写真を1枚以上えらんでください'])
    expect(stepIssues(draft, 'letter')).toHaveLength(3)
    expect(draftIssues(complete())).toEqual([])
  })

  it('applies the e-gift URL rules', () => {
    expect(assessEgift({ kind: 'url', url: 'http://giftee.com/a', acceptOffList: false })).toEqual({
      status: 'block',
      message: 'https:// から始まるURLだけ使えます',
    })
    expect(assessEgift({ kind: 'url', url: 'https://bit.ly/x', acceptOffList: false }).status).toBe('block')
    expect(assessEgift({ kind: 'url', url: 'https://giftee.com/a', acceptOffList: false })).toEqual({ status: 'ok', domain: 'giftee.com' })
    const offList = complete({ type: 'egift', egift: { kind: 'url', url: 'https://shop.example.net/a', acceptOffList: false } })
    expect(stepIssues(offList, 'egift')[0]).toContain('shop.example.net')
    const accepted = reduceDraft(offList, { type: 'egift', egift: { kind: 'url', url: 'https://shop.example.net/a', acceptOffList: true } })
    expect(stepIssues(accepted, 'egift')).toEqual([])
    const shortPass = reduceDraft(accepted, { type: 'passphrase', passphrase: 'abc' })
    expect(stepIssues(shortPass, 'egift')).toEqual(['合言葉は4〜32文字です'])
  })
})

describe('buildContent', () => {
  it('builds Share JSON v1 the player parser accepts', () => {
    const built = buildContent(complete({ type: 'egift', egift: { kind: 'url', url: 'https://giftee.com/cards/1', acceptOffList: false } }))
    expect(built.ok).toBe(true)
    if (!built.ok) return
    expect(parseShareJson(built.value.share, catalogIndex()).ok).toBe(true)
    expect(parseRevealJson(built.value.reveal).ok).toBe(true)
    expect(built.value.share.course).toMatchObject({ templateId: 'course-01', difficulty: 'easy', obstaclePresets: ['preset-easy'] })
    expect(built.value.share.memoryCoins.map((c) => [c.order, c.photoRef])).toEqual([
      [1, 'p-a'],
      [2, 'p-b'],
      [3, 'p-c'],
    ])
    expect(built.value.share.goal.egift).toEqual({ present: true, kind: 'url', domain: 'giftee.com', passphrase: false })
    expect(built.value.share.goal.egift).not.toHaveProperty('url')
    expect(built.value.reveal).toEqual({ letter: { body: '彩へ\nいつもありがとう' }, egift: { kind: 'url', url: 'https://giftee.com/cards/1' } })
  })

  it('carries a code e-gift with its passphrase flag, and no e-gift at all', () => {
    const code = buildContent(complete({ type: 'egift', egift: { kind: 'code', code: 'GIFT-1' } }, { type: 'passphrase', passphrase: 'ひみつ123' }))
    expect(code.ok && code.value.share.goal.egift).toEqual({ present: true, kind: 'code', passphrase: true })
    expect(code.ok && code.value.passphrase).toBe('ひみつ123')
    const none = buildContent(complete())
    expect(none.ok && none.value.share.goal.egift).toEqual({ present: false })
    expect(none.ok && none.value.reveal).toEqual({ letter: { body: '彩へ\nいつもありがとう' } })
  })

  it('refuses an unfinished draft', () => {
    expect(buildContent(emptyDraft())).toMatchObject({ ok: false })
  })

  it('makes an injection script that sets the preview global', () => {
    const built = buildContent(complete({ type: 'letter', letter: 'a\u2028b' }))
    if (!built.ok) throw new Error('draft')
    const payload = previewPayload(built.value, { 'p-a': 'data:image/jpeg;base64,AAAA' })
    const script = previewInjection(payload)
    expect(script).not.toContain('\u2028')
    const win: { __GFY_PREVIEW__?: unknown } = {}
    new Function('window', script)(win)
    expect(win.__GFY_PREVIEW__).toEqual(JSON.parse(JSON.stringify(payload)))
  })
})
