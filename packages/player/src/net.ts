import { SAMPLE_REVEALS } from '@gfy/catalog'
import { parseRevealJson, type RevealJson } from '@gfy/schema'

export type Reveal = RevealJson

const queueKey = 'gfy-events'

function remember(id: string, type: string) {
  let queue: { id: string; type: string }[] = []
  try {
    const raw = localStorage.getItem(queueKey)
    if (raw) {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) queue = parsed
    }
  } catch {
    queue = []
  }
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
  let raw: unknown = null
  try {
    const res = await fetch(`/s/${encodeURIComponent(id)}/reveal`)
    if (res.ok) raw = await res.json()
  } catch {
    raw = null
  }
  if (raw === null) raw = id === 'offlist' ? SAMPLE_REVEALS.offlist : SAMPLE_REVEALS.demo
  const parsed = parseRevealJson(raw)
  if (!parsed.ok) throw new Error(parsed.issues.join(','))
  return parsed.value
}
