/** Character limits shared by the Share JSON parser and the creator forms. Counted in code points. */
export const LIMITS = {
  displayName: 12,
  coinMessage: 40,
  giftLabel: 20,
  letter: 500,
  egiftCode: 80,
  coins: 10,
  passphraseMin: 4,
  passphraseMax: 32,
} as const

/** Days a standard-tier gift stays reachable. The premium tier sets its own (PRICE_TIERS). */
export const SHARE_TTL_DAYS = 14
