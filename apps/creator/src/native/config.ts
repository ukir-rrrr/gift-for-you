/** Worker origin: the API and the player bundle the preview loads. Set EXPO_PUBLIC_API_ORIGIN per build. */
export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:8787').replace(/\/$/, '')

/** Local runs and e2e register a fake push token so the mock notifier has somewhere to send. */
export const PUSH_MOCK = process.env.EXPO_PUBLIC_PUSH_MOCK === '1'

/** "revenuecat" uses App Store / Google Play through RevenueCat; anything else is the sandbox store. */
export const STORE_KIND = process.env.EXPO_PUBLIC_STORE ?? 'sandbox'

/** RevenueCat public SDK keys (not secrets, but per project; set per build, never committed). */
export const REVENUECAT_KEYS = {
  ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '',
  android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '',
}

/** Local runs and e2e can link a fake account; real builds use Sign in with Apple. */
export const SIGNIN_MOCK = process.env.EXPO_PUBLIC_SIGNIN_MOCK === '1'

/** Where the legal and support pages live (the Worker). */
export const LEGAL_URLS = {
  terms: `${API_ORIGIN}/legal/terms`,
  privacy: `${API_ORIGIN}/legal/privacy`,
  tokushoho: `${API_ORIGIN}/legal/tokushoho`,
  support: `${API_ORIGIN}/support`,
}
