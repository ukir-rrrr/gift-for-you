import { createApp } from './app'
import type { Env } from './env'
import { sweep } from './store'

const app = createApp()
const DRAFT_TTL_MS = 48 * 3600_000

export default {
  fetch: app.fetch,
  /** Cron: removes expired gifts (photos included) and drafts nobody published. */
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sweep(env.DB, env.PHOTOS, Date.now(), DRAFT_TTL_MS).then(() => undefined))
  },
} satisfies ExportedHandler<Env>
