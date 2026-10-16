export const CATALOG_VERSION = '2026.10.1'

export type GiftCategory = 'wear' | 'home' | 'sweets' | 'hobby'

export const GIFT_CATEGORIES: readonly { id: GiftCategory; name: string }[] = [
  { id: 'wear', name: '身につけるもの' },
  { id: 'home', name: '暮らしのもの' },
  { id: 'sweets', name: 'おいしいもの' },
  { id: 'hobby', name: '趣味のもの' },
]

// Sprites: Phase 1 items are drawn in generate-art.ts, the rest come from scripts/item-sprites.ts.
// Both use the 28-colour style palette.
export const GIFT_ITEMS = [
  { id: 'scarf', name: 'マフラー', category: 'wear' },
  { id: 'mug', name: 'マグカップ', category: 'home' },
  { id: 'book', name: '本', category: 'hobby' },
  { id: 'bouquet', name: '花束', category: 'home' },
  { id: 'pendant', name: 'ペンダント', category: 'wear' },
  { id: 'cake', name: 'ケーキ', category: 'sweets' },
  { id: 'ring', name: '指輪', category: 'wear' },
  { id: 'watch', name: '腕時計', category: 'wear' },
  { id: 'teddy', name: 'くまのぬいぐるみ', category: 'home' },
  { id: 'camera', name: 'カメラ', category: 'hobby' },
  { id: 'headphones', name: 'ヘッドホン', category: 'hobby' },
  { id: 'umbrella', name: '傘', category: 'wear' },
  { id: 'gloves', name: '手袋', category: 'wear' },
  { id: 'plant', name: '観葉植物', category: 'home' },
  { id: 'cookies', name: 'クッキー缶', category: 'sweets' },
  { id: 'tea', name: '紅茶', category: 'sweets' },
  { id: 'hat', name: '帽子', category: 'wear' },
  { id: 'perfume', name: '香水', category: 'wear' },
  { id: 'candle', name: 'キャンドル', category: 'home' },
  { id: 'sneakers', name: 'スニーカー', category: 'wear' },
] as const satisfies readonly { id: string; name: string; category: GiftCategory }[]

export type GiftItemId = (typeof GIFT_ITEMS)[number]['id']

export const REVEAL_IDS = ['reveal-01'] as const
export const BGM_IDS = ['bgm-01'] as const

export function giftItem(id: string): (typeof GIFT_ITEMS)[number] {
  const item = GIFT_ITEMS.find((entry) => entry.id === id)
  if (!item) throw new Error(`unknown gift item ${id}`)
  return item
}
