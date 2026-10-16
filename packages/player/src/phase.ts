import type { AssistMode } from './sim/platformer'

/** Opening the gift after the tap: the box shakes, bursts open, then the item is held up. */
export type RevealBeat = 'prompt' | 'shake' | 'burst' | 'show'

export const BEAT_SECONDS = { shake: 0.8, burst: 0.6, show: 1.6 } as const

export type SessionPhase =
  | { kind: 'title' }
  | { kind: 'play' }
  | { kind: 'assist' }
  | { kind: 'reveal'; beat: RevealBeat }
  | { kind: 'letter' }
  | { kind: 'error' }

export type SnapView = {
  atGoal: boolean
  assist: AssistMode
}

const NEXT_BEAT = { shake: 'burst', burst: 'show' } as const

export function fold(session: SessionPhase, snap: SnapView, open: boolean, beatFor: number): SessionPhase {
  if (session.kind === 'title' || session.kind === 'letter' || session.kind === 'error') return session
  if ((session.kind === 'play' || session.kind === 'assist') && snap.atGoal) {
    return { kind: 'reveal', beat: 'prompt' }
  }
  if (session.kind === 'play' && snap.assist === 'offered') return { kind: 'assist' }
  if (session.kind === 'assist' && snap.assist !== 'offered') return { kind: 'play' }
  if (session.kind !== 'reveal') return session
  if (session.beat === 'prompt') return open ? { kind: 'reveal', beat: 'shake' } : session
  if (beatFor < BEAT_SECONDS[session.beat]) return session
  if (session.beat === 'show') return { kind: 'letter' }
  return { kind: 'reveal', beat: NEXT_BEAT[session.beat] }
}

export function screenOf(phase: SessionPhase): 'title' | 'play' | 'letter' | 'error' {
  if (phase.kind === 'assist' || phase.kind === 'reveal') return 'play'
  return phase.kind
}

export function revealBeat(phase: SessionPhase): RevealBeat | null {
  return phase.kind === 'reveal' ? phase.beat : null
}

export function showingGift(phase: SessionPhase): boolean {
  return revealBeat(phase) === 'show'
}

export const TYPE_CPS = 28

/** Characters of the letter on screen after `seconds` of typing. Splits by code point so surrogate pairs stay whole. */
export function typedLetter(full: string, seconds: number): { text: string; done: boolean } {
  const chars = [...full]
  const shown = Math.min(chars.length, Math.max(0, Math.floor(seconds * TYPE_CPS)))
  return { text: chars.slice(0, shown).join(''), done: shown >= chars.length }
}
