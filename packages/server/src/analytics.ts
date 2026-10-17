/**
 * F3-07 analytics. Names are a closed list and props are small enums or numbers: no names,
 * messages, photos, URLs, share ids, or keys ever go in.
 */
export const EVENT_NAMES = [
  // Server-side, recorded where they happen.
  'gift_created',
  'photo_rejected',
  'text_rejected',
  'purchase_verified',
  'gift_published',
  'gift_opened',
  'goal_reached',
  'egift_opened',
  'thanks_sent',
  'report_submitted',
  'gift_hidden',
  'removal_requested',
  'sender_blocked',
  'gift_revoked',
  'gift_expired',
  'account_linked',
  'account_deleted',
  // Sent by the creator app.
  'create_started',
  'preview_opened',
  'purchase_started',
  'purchase_cancelled',
] as const

export type EventName = (typeof EVENT_NAMES)[number]

export const CLIENT_EVENTS: readonly EventName[] = ['create_started', 'preview_opened', 'purchase_started', 'purchase_cancelled']

export type EventProps = Record<string, string | number | boolean>

const PROP_VALUE = /^[a-z0-9_-]{1,40}$/

export function cleanProps(props: unknown): EventProps {
  const out: EventProps = {}
  if (!props || typeof props !== 'object') return out
  for (const [key, value] of Object.entries(props as Record<string, unknown>).slice(0, 6)) {
    if (!/^[a-z_]{1,24}$/.test(key)) continue
    if (typeof value === 'number' && Number.isFinite(value)) out[key] = value
    else if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'string' && PROP_VALUE.test(value)) out[key] = value
  }
  return out
}

export async function track(db: D1Database, name: EventName, at: number, props: EventProps = {}): Promise<void> {
  const clean = cleanProps(props)
  await db
    .prepare('INSERT INTO analytics_events (name, props, at) VALUES (?, ?, ?)')
    .bind(name, Object.keys(clean).length ? JSON.stringify(clean) : null, at)
    .run()
}

export type EventCount = { name: string; n: number }

export async function eventCounts(db: D1Database, since: number): Promise<EventCount[]> {
  const { results } = await db
    .prepare('SELECT name, COUNT(*) AS n FROM analytics_events WHERE at >= ? GROUP BY name ORDER BY name')
    .bind(since)
    .all<EventCount>()
  return results
}
