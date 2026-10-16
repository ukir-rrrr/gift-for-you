import { describe, expect, it } from 'vitest'
import { checkEgiftUrl, parseRevealJson, parseShareJson, sanitizeDisplay, type CatalogIndex } from '../src/index'

const index: CatalogIndex = {
  templateIds: ['course-01'],
  itemIds: ['scarf', 'mug', 'book', 'bouquet', 'pendant'],
  revealIds: ['reveal-01'],
  bgmIds: ['bgm-01'],
  hairIds: ['hair-short', 'hair-bob'],
  skinIds: ['skin-light', 'skin-deep'],
  outfitIds: ['outfit-shirt', 'outfit-coat'],
  palette: ['#e8c4a0', '#3a2418'],
  presetsByDifficulty: {
    easy: ['preset-easy'],
    normal: ['preset-normal'],
    hard: ['preset-hard'],
  },
}

function sample(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    mode: 'platformer',
    catalogVersion: '2026.10.1',
    locale: 'ja',
    from: { displayName: '健太' },
    to: { displayName: '彩' },
    course: {
      templateId: 'course-01',
      difficulty: 'normal',
      obstaclePresets: ['preset-normal'],
      assist: { autoAssistAfterFails: 3, easyModeDefault: false },
    },
    memoryCoins: [{ order: 1, photoRef: 'photo-1', message: 'はじめて並んで歩いた日' }],
    goal: {
      revealEffectId: 'reveal-01',
      giftItem: { itemId: 'scarf', label: 'ずっと欲しかったマフラー' },
      letter: { present: true },
      egift: { present: true, kind: 'url', domain: 'giftee.com', passphrase: false },
    },
    options: { recordingModeDefault: false, bgmId: 'bgm-01' },
    expiresAt: '2027-01-13T00:00:00Z',
    ...overrides,
  }
}

describe('parseShareJson', () => {
  it('accepts the v1 sample and drops unknown fields', () => {
    const parsed = parseShareJson({ ...sample(), editorNote: 'ignore me' }, index)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.value.to.displayName).toBe('彩')
    expect('editorNote' in parsed.value).toBe(false)
  })

  it('rejects a future mode, a long name, and a preset that disagrees with difficulty', () => {
    expect(parseShareJson(sample({ mode: 'kart' }), index).ok).toBe(false)
    expect(parseShareJson(sample({ to: { displayName: 'ながすぎるなまえですねよね' } }), index).ok).toBe(false)
    const wrong = sample()
    ;(wrong.course as { difficulty: string }).difficulty = 'easy'
    expect(parseShareJson(wrong, index).ok).toBe(false)
  })

  it('rejects eleven coins, javascript urls, and shorteners', () => {
    const coins = Array.from({ length: 11 }, (_, i) => ({
      order: i + 1,
      photoRef: `p${i}`,
      message: 'あ',
    }))
    expect(parseShareJson(sample({ memoryCoins: coins }), index).ok).toBe(false)
    const js = sample()
    ;(js.goal as { egift: { url?: string } }).egift.url = 'javascript:alert(1)'
    expect(parseShareJson(js, index).ok).toBe(false)
    const short = sample()
    ;(short.goal as { egift: { url?: string } }).egift.url = 'https://bit.ly/abc'
    expect(parseShareJson(short, index).ok).toBe(false)
    expect(
      parseShareJson(sample({ memoryCoins: [{ order: 1, photoRef: '../secret', message: 'あ' }] }), index).ok,
    ).toBe(false)
  })

  it('strips emoji instead of substituting a box', () => {
    expect(sanitizeDisplay('花\u0007束😀')).toBe('花束')
    expect(sanitizeDisplay('彩へ🎁')).toBe('彩へ')
    expect(sanitizeDisplay('あいう')).not.toContain('□')
    expect(sanitizeDisplay('彩へ。\r\n健太')).toBe('彩へ。\n健太')
    const parsed = parseShareJson(sample({ to: { displayName: '彩😀' } }), index)
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.to.displayName).toBe('彩')
  })
})

describe('parseRevealJson', () => {
  it('accepts a letter and blocks javascript egift urls', () => {
    const parsed = parseRevealJson({
      letter: { body: '彩へ。箱の中はマフラー。' },
      egift: { kind: 'url', url: 'https://giftee.com/cards/demo' },
    })
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.value.letter.body).toBe('彩へ。箱の中はマフラー。')
    const letter = parseRevealJson({ letter: { body: '彩へ。\n箱の中はマフラー。\n健太' } })
    expect(letter.ok).toBe(true)
    if (letter.ok) expect(letter.value.letter.body).toBe('彩へ。\n箱の中はマフラー。\n健太')
    expect(parseRevealJson({ letter: { body: 'あ' }, egift: { kind: 'url', url: 'javascript:alert(1)' } }).ok).toBe(false)
    expect(parseRevealJson({ letter: { body: '' } }).ok).toBe(false)
  })
})

describe('checkEgiftUrl', () => {
  it('allows the list, warns on other https hosts, and blocks schemes', () => {
    expect(checkEgiftUrl('https://giftee.com/cards/demo').status).toBe('allow')
    expect(checkEgiftUrl('https://www.amazon.co.jp/gp/css').status).toBe('allow')
    expect(checkEgiftUrl('https://gift.example/demo').status).toBe('allow')
    expect(checkEgiftUrl('https://shop.example/gift/1')).toEqual({ status: 'warn', domain: 'shop.example' })
    expect(checkEgiftUrl('http://giftee.com/x').status).toBe('block')
  })
})
