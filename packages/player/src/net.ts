import { SAMPLE_REVEALS } from '@gfy/catalog'
import { sanitizeDisplay } from '@gfy/schema'

export type Reveal = {
  letter: { body: string }
  egift?: { kind: 'url' | 'code'; url?: string; code?: string }
}

const queueKey = 'gfy-events'

function remember(id: string, type: string) {
  const raw = localStorage.getItem(queueKey)
  const queue = raw ? (JSON.parse(raw) as { id: string; type: string }[]) : []
  queue.push({ id, type })
  localStorage.setItem(queueKey, JSON.stringify(queue))
}

export function markGoal(id: string) {
  sessionStorage.setItem(`gfy-goal-${id}`, '1')
}

export function goalMarked(id: string): boolean {
  return sessionStorage.getItem(`gfy-goal-${id}`) === '1'
}

export async function postEvent(id: string, type: 'opened' | 'goal_reached') {
  if (type === 'goal_reached') markGoal(id)
  try {
    const res = await fetch(`/s/${encodeURIComponent(id)}/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type, at: new Date().toISOString() }),
    })
    if (!res.ok) throw new Error(String(res.status))
  } catch {
    remember(id, type)
  }
}

export async function fetchReveal(id: string): Promise<Reveal> {
  if (!goalMarked(id)) throw new Error('goal required')
  try {
    const res = await fetch(`/s/${encodeURIComponent(id)}/reveal`)
    if (res.ok) {
      const body = (await res.json()) as Reveal
      return {
        letter: { body: sanitizeDisplay(body.letter.body) },
        egift: body.egift,
      }
    }
  } catch {
    // fall through to the bundled fixture
  }
  const bundled = id === 'offlist' ? SAMPLE_REVEALS.offlist : SAMPLE_REVEALS.demo
  return {
    letter: { body: sanitizeDisplay(bundled.letter.body) },
    egift: bundled.egift?.url ? { kind: 'url', url: bundled.egift.url } : undefined,
  }
}
