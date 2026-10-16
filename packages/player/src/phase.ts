export type SessionPhase =
  | { kind: 'title' }
  | { kind: 'play' }
  | { kind: 'assist' }
  | { kind: 'reveal'; beat: 1 | 2 | 3 }
  | { kind: 'letter' }
  | { kind: 'error' }

export type PhaseEvent =
  | { type: 'boot-error' }
  | { type: 'start' }
  | { type: 'fail'; fails: number; threshold: number }
  | { type: 'assist-close' }
  | { type: 'goal' }
  | { type: 'reveal-tap' }
  | { type: 'reveal-advance' }
  | { type: 'to-letter' }

export function nextPhase(phase: SessionPhase, event: PhaseEvent): SessionPhase {
  switch (phase.kind) {
    case 'title':
      if (event.type === 'start') return { kind: 'play' }
      if (event.type === 'boot-error') return { kind: 'error' }
      return phase
    case 'play':
      if (event.type === 'fail' && event.fails > 0 && event.fails % event.threshold === 0) return { kind: 'assist' }
      if (event.type === 'goal') return { kind: 'reveal', beat: 1 }
      return phase
    case 'assist':
      if (event.type === 'assist-close') return { kind: 'play' }
      return phase
    case 'reveal':
      if (event.type === 'reveal-tap' && phase.beat === 1) return { kind: 'reveal', beat: 2 }
      if (event.type === 'reveal-advance' && phase.beat === 2) return { kind: 'reveal', beat: 3 }
      if (event.type === 'to-letter' && phase.beat === 3) return { kind: 'letter' }
      return phase
    default:
      return phase
  }
}

export function screenOf(phase: SessionPhase): 'title' | 'play' | 'letter' | 'error' {
  if (phase.kind === 'assist' || phase.kind === 'reveal') return 'play'
  return phase.kind
}
