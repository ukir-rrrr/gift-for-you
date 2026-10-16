import type { AssistMode } from './sim/platformer'

export type SessionPhase =
  | { kind: 'title' }
  | { kind: 'play' }
  | { kind: 'assist' }
  | { kind: 'reveal'; beat: 'prompt' | 'show' }
  | { kind: 'letter' }
  | { kind: 'error' }

export type SnapView = {
  atGoal: boolean
  assist: AssistMode
}

export function fold(session: SessionPhase, snap: SnapView, open: boolean, shownFor: number): SessionPhase {
  if (session.kind === 'title' || session.kind === 'letter' || session.kind === 'error') return session
  if ((session.kind === 'play' || session.kind === 'assist') && snap.atGoal) {
    return { kind: 'reveal', beat: 'prompt' }
  }
  if (session.kind === 'play' && snap.assist === 'offered') return { kind: 'assist' }
  if (session.kind === 'assist' && snap.assist !== 'offered') return { kind: 'play' }
  if (session.kind === 'reveal' && session.beat === 'prompt' && open) return { kind: 'reveal', beat: 'show' }
  if (session.kind === 'reveal' && session.beat === 'show' && shownFor > 1.3) return { kind: 'letter' }
  return session
}

export function screenOf(phase: SessionPhase): 'title' | 'play' | 'letter' | 'error' {
  if (phase.kind === 'assist' || phase.kind === 'reveal') return 'play'
  return phase.kind
}

export function showingGift(phase: SessionPhase): boolean {
  return phase.kind === 'reveal' && phase.beat === 'show'
}
