export type Env = {
  DB: D1Database
  PHOTOS: R2Bucket
  /** The player bundle (Workers static assets). */
  ASSETS?: Fetcher
  /** Origin the share and revoke links point at, e.g. https://gift.example. */
  PUBLIC_ORIGIN: string
  /** Comma-separated origins allowed to call /api from a browser (the creator's web build). */
  CORS_ORIGINS?: string
  /** "mock" is the only provider in this tree; anything else refuses to run. */
  MODERATION: string
  PURCHASE: string
  NOTIFIER: string
  /** "1" exposes /api/_mock/* for local runs and e2e. */
  MOCK_INSPECT?: string
}
