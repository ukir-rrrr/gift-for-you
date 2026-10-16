export const CATALOG_VERSION = '2026.10.1'

export const GIFT_ITEMS = [
  { id: 'scarf', name: 'マフラー' },
  { id: 'mug', name: 'マグカップ' },
  { id: 'book', name: '本' },
  { id: 'bouquet', name: '花束' },
  { id: 'pendant', name: 'ペンダント' },
] as const

export type GiftItemId = (typeof GIFT_ITEMS)[number]['id']

export const REVEAL_IDS = ['reveal-01'] as const
export const BGM_IDS = ['bgm-01'] as const

export function giftItem(id: string): (typeof GIFT_ITEMS)[number] {
  const item = GIFT_ITEMS.find((entry) => entry.id === id)
  if (!item) throw new Error(`unknown gift item ${id}`)
  return item
}
