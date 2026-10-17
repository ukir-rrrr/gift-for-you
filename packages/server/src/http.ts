import type { Context } from 'hono'
import type { Env } from './env'
import { ServiceConfigError, type Services } from './services'

export type AdminSession = { exp: number; csrf: string }

export type AppEnv = {
  Bindings: Env
  Variables: { services: Services; deviceId: string; accountId: string | null; adminSession: AdminSession }
}
export type Ctx = Context<AppEnv>

export const DAY_MS = 24 * 3600_000

export const json = (c: Ctx, status: number, body: unknown) => c.json(body as object, status as 200)
export const fail = (c: Ctx, status: number, error: string, extra: Record<string, unknown> = {}) => json(c, status, { error, ...extra })

/** Reads at most `max` bytes; null when the body is larger. */
export async function readLimited(c: Ctx, max: number): Promise<Uint8Array | null> {
  const declared = Number(c.req.header('content-length') ?? '0')
  if (declared > max) return null
  const body = new Uint8Array(await c.req.arrayBuffer())
  return body.length > max ? null : body
}

export async function readJson(c: Ctx, max: number): Promise<unknown | undefined> {
  const body = await readLimited(c, max)
  if (!body) return undefined
  try {
    return JSON.parse(new TextDecoder().decode(body)) as unknown
  } catch {
    return undefined
  }
}

export function noindex(c: Ctx) {
  c.header('X-Robots-Tag', 'noindex, nofollow')
  c.header('Cache-Control', 'no-store')
}

export function configuredOrigin(env: Env): string | null {
  const origin = (env.PUBLIC_ORIGIN ?? '').replace(/\/$/, '')
  return /^https?:\/\/[^/]+$/.test(origin) ? origin : null
}

/** Share and revoke links point here. Unset means links would lead nowhere, so publishing fails closed. */
export function publicOrigin(env: Env): string {
  const origin = configuredOrigin(env)
  if (!origin) throw new ServiceConfigError('PUBLIC_ORIGIN is not set')
  return origin
}

/** The caller's IP as Cloudflare reports it. Only ever stored hashed. */
export function clientIp(c: Ctx): string {
  return c.req.header('cf-connecting-ip') ?? c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
}

export function htmlEscape(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!)
}
