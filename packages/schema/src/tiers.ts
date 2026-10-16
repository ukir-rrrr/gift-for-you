/**
 * F3-03 price tiers. Both are consumable in-app purchases, one per published gift. The product ids
 * must match App Store Connect, Google Play Console, and the RevenueCat offering (docs/phase3.md).
 */
export const PRICE_TIERS = [
  {
    id: 'standard',
    productId: 'gfy_gift_standard',
    priceJpy: 480,
    name: 'スタンダード',
    ttlDays: 14,
    blurb: 'リンクは14日間ひらけます',
  },
  {
    id: 'premium',
    productId: 'gfy_gift_premium',
    priceJpy: 980,
    name: 'ロング',
    ttlDays: 30,
    blurb: 'リンクは30日間ひらけます',
  },
] as const

export type PriceTier = (typeof PRICE_TIERS)[number]
export type TierId = PriceTier['id']

export function tierById(id: string): PriceTier | undefined {
  return PRICE_TIERS.find((tier) => tier.id === id)
}

export function tierByProduct(productId: string): PriceTier | undefined {
  return PRICE_TIERS.find((tier) => tier.productId === productId)
}

/** F3-09 stamps the recipient can send back once, after the letter. */
export const THANKS_STAMPS = [
  { id: 'thanks', label: 'ありがとう' },
  { id: 'happy', label: 'うれしい！' },
  { id: 'love', label: 'だいすき' },
  { id: 'again', label: 'またあそぼう' },
] as const

export type ThanksStampId = (typeof THANKS_STAMPS)[number]['id']

export function thanksStamp(id: string): (typeof THANKS_STAMPS)[number] | undefined {
  return THANKS_STAMPS.find((stamp) => stamp.id === id)
}

/** F3-05 reasons a recipient (or anyone with the link) can report a gift for. */
export const REPORT_REASONS = [
  { id: 'inappropriate', label: '不適切な写真や言葉がある' },
  { id: 'me_in_photo', label: '自分が写っていて、消してほしい' },
  { id: 'harassment', label: 'いやがらせ・つきまとい' },
  { id: 'scam', label: '詐欺・あやしいリンク' },
  { id: 'other', label: 'その他' },
] as const

export type ReportReasonId = (typeof REPORT_REASONS)[number]['id']

export const REPORT_DETAIL_MAX = 300
