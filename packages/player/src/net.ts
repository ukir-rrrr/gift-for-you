import { SAMPLE_REVEALS } from '@gfy/catalog'
import { parseRevealJson, type RevealJson } from '@gfy/schema'

export type Reveal = RevealJson

export type BeaconType = 'opened' | 'goal_reached'

type Queued = { id: string; type: BeaconType }

const queueKey = 'gfy-events'
const QUEUE_MAX = 20
// Link unfurlers and search crawlers that run scripts. Named one by one so phones like "Cubot" and
// in-app browsers (LINE is "Line/x.y", Instagram is "Instagram x.y") never match.
const CRAWLER_UA =
  /googlebot|google-inspectiontool|bingbot|slurp|duckduckbot|baiduspider|yandexbot|applebot|petalbot|bytespider|gptbot|claudebot|ahrefsbot|semrushbot|facebookexternalhit|facebot|twitterbot|slackbot|discordbot|linkedinbot|telegrambot|linespider|chrome-lighthouse/i

// Storage can throw (Safari private mode, blocked site data), so the goal flag lives in memory too.
const goalsHere = new Set<string>()

function storage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return globalThis[kind] ?? null
  } catch {
    return null
  }
}

export function isCrawler(env: { userAgent?: string; visibilityState?: string } = {}): boolean {
  const ua = env.userAgent ?? globalThis.navigator?.userAgent ?? ''
  const visibility = env.visibilityState ?? globalThis.document?.visibilityState
  return CRAWLER_UA.test(ua) || visibility === 'prerender'
}

export function readQueue(): Queued[] {
  try {
    const raw = storage('localStorage')?.getItem(queueKey)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is Queued =>
        typeof entry?.id === 'string' && (entry.type === 'opened' || entry.type === 'goal_reached'),
    )
  } catch {
    return []
  }
}

function writeQueue(queue: Queued[]) {
  try {
    const store = storage('localStorage')
    if (!store) return
    if (queue.length === 0) store.removeItem(queueKey)
    else store.setItem(queueKey, JSON.stringify(queue.slice(-QUEUE_MAX)))
  } catch {
    // a full or blocked store just drops the beacon
  }
}

function remember(id: string, type: BeaconType) {
  const queue = readQueue()
  if (queue.some((entry) => entry.id === id && entry.type === type)) return
  writeQueue([...queue, { id, type }])
}

export function markGoal(id: string) {
  goalsHere.add(id)
  try {
    storage('sessionStorage')?.setItem(`gfy-goal-${id}`, '1')
  } catch {
    // memory flag above still unlocks the letter for this page
  }
}

export function goalMarked(id: string): boolean {
  if (goalsHere.has(id)) return true
  try {
    return storage('sessionStorage')?.getItem(`gfy-goal-${id}`) === '1'
  } catch {
    return false
  }
}

async function send(id: string, type: BeaconType): Promise<boolean> {
  try {
    // Anonymous: only the event type and time. No name, no user agent, no cookie.
    const res = await fetch(`/s/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, at: new Date().toISOString() }),
      credentials: 'omit',
      keepalive: true,
    })
    return res.ok
  } catch {
    return false
  }
}

/** Never throws and never blocks play. A failed send waits in localStorage for the next visit. */
export async function postEvent(id: string, type: BeaconType): Promise<'sent' | 'queued' | 'skipped'> {
  if (type === 'goal_reached') markGoal(id)
  if (isCrawler()) return 'skipped'
  if (await send(id, type)) return 'sent'
  remember(id, type)
  return 'queued'
}

export async function flushQueue(): Promise<number> {
  if (isCrawler()) return 0
  const queue = readQueue()
  if (queue.length === 0) return 0
  const sent: Queued[] = []
  for (const entry of queue) {
    if (await send(entry.id, entry.type)) sent.push(entry)
  }
  // Re-read so beacons queued while these were in flight are kept; drop only what went out.
  const isSent = (entry: Queued) => sent.some((done) => done.id === entry.id && done.type === entry.type)
  if (sent.length > 0) writeQueue(readQueue().filter((entry) => !isSent(entry)))
  return sent.length
}

export async function fetchReveal(id: string): Promise<Reveal> {
  if (!goalMarked(id)) throw new Error('goal required')
  let raw: unknown = null
  try {
    const res = await fetch(`/s/${encodeURIComponent(id)}/reveal`)
    if (res.ok) raw = await res.json()
  } catch {
    raw = null
  }
  if (raw === null) {
    // Only the bundled samples may fall back; a real gift's letter comes from the server or not at all.
    if (id !== 'demo' && id !== 'offlist') throw new Error('reveal unavailable')
    raw = SAMPLE_REVEALS[id]
  }
  const parsed = parseRevealJson(raw)
  if (!parsed.ok) throw new Error(parsed.issues.join(','))
  return parsed.value
}
