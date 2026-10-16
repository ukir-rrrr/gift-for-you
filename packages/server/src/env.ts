export type Env = {
  DB: D1Database
  PHOTOS: R2Bucket
  /** The player bundle (Workers static assets). */
  ASSETS?: Fetcher
  /** Origin the share and revoke links point at, e.g. https://gift.example. Empty: publishing answers 503. */
  PUBLIC_ORIGIN: string
  /** Comma-separated origins allowed to call /api from a browser (the creator's web build). */
  CORS_ORIGINS?: string
  /** "mock" | "vision" (Cloud Vision SafeSearch + word list). Anything else refuses to run. */
  MODERATION: string
  /** "sandbox-mock" | "revenuecat". */
  PURCHASE: string
  /** "mock" | "expo". */
  NOTIFIER: string
  /** "mock" | "oidc" (Apple / Google ID tokens) | "none". Unset means none. */
  SIGNIN?: string
  /** "1" exposes /api/_mock/* for local runs and e2e. */
  MOCK_INSPECT?: string

  // Secrets (wrangler secret put). Never in wrangler.jsonc or the repo.
  GOOGLE_VISION_API_KEY?: string
  REVENUECAT_SECRET_KEY?: string
  /** The exact Authorization header value configured for the RevenueCat webhook. */
  REVENUECAT_WEBHOOK_AUTH?: string
  EXPO_ACCESS_TOKEN?: string
  /** At least 32 characters. Unset: /admin answers 503. */
  ADMIN_TOKEN?: string
  /** Mixed into reporter and viewer hashes so stored hashes cannot be traced back to IPs. */
  HASH_SALT?: string

  /** "0" refuses sandbox (TestFlight / App Review) purchases. Default accepts them. */
  REVENUECAT_ALLOW_SANDBOX?: string
  /** Sign in with Apple audience (the iOS bundle id). */
  APPLE_AUDIENCE?: string
  /** Comma-separated Google OAuth client ids. */
  GOOGLE_AUDIENCES?: string
  /** Distinct reports that hide a gift until an operator looks. Default 3. */
  REPORT_HIDE_THRESHOLD?: string
  /** Shown on the support and legal pages. */
  SUPPORT_EMAIL?: string
}
