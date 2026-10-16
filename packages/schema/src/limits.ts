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

/** Days a published gift stays reachable. Fixed for Phase 2. */
export const SHARE_TTL_DAYS = 14
