import { describe, expect, it } from 'vitest'
import { nextPhase, screenOf } from '../src/phase'

describe('session phase', () => {
  it('walks title, play, assist, reveal, and letter in order', () => {
    let phase = nextPhase({ kind: 'title' }, { type: 'start' })
    expect(phase).toEqual({ kind: 'play' })
    phase = nextPhase(phase, { type: 'fail', fails: 1, threshold: 3 })
    expect(phase.kind).toBe('play')
    phase = nextPhase(phase, { type: 'fail', fails: 3, threshold: 3 })
    expect(phase).toEqual({ kind: 'assist' })
    phase = nextPhase(phase, { type: 'assist-close' })
    expect(phase).toEqual({ kind: 'play' })
    phase = nextPhase(phase, { type: 'goal' })
    expect(phase).toEqual({ kind: 'reveal', beat: 1 })
    phase = nextPhase(phase, { type: 'reveal-tap' })
    expect(phase).toEqual({ kind: 'reveal', beat: 2 })
    phase = nextPhase(phase, { type: 'reveal-advance' })
    expect(phase).toEqual({ kind: 'reveal', beat: 3 })
    phase = nextPhase(phase, { type: 'to-letter' })
    expect(phase).toEqual({ kind: 'letter' })
    expect(nextPhase({ kind: 'title' }, { type: 'goal' })).toEqual({ kind: 'title' })
    expect(screenOf({ kind: 'reveal', beat: 1 })).toBe('play')
    expect(screenOf({ kind: 'assist' })).toBe('play')
  })
})
