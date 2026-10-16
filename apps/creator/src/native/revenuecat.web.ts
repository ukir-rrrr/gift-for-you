import type { Store } from '../lib/purchases'

/** The web build has no App Store or Google Play; it always uses the sandbox store. */
export const revenueCatStore: Store | null = null
