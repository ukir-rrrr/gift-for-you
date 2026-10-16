import { describe, expect, it } from 'vitest'
import { fold, screenOf, showingGift, type SessionPhase } from '../src/phase'

const idle = { atGoal: false, assist: 'none' as const }

describe('session phase', () => {
  it('folds play, assist, reveal, and letter from the snapshot', () => {
    let phase: SessionPhase = { kind: 'play' }
    phase = fold(phase, idle, false, 0)
    expect(phase).toEqual({ kind: 'play' })
    phase = fold(phase, { atGoal: false, assist: 'offered' }, false, 0)
    expect(phase).toEqual({ kind: 'assist' })
    phase = fold(phase, { atGoal: false, assist: 'invincible' }, false, 0)
    expect(phase).toEqual({ kind: 'play' })
    phase = fold(phase, { atGoal: true, assist: 'none' }, false, 0)
    expect(phase).toEqual({ kind: 'reveal', beat: 'prompt' })
    phase = fold(phase, { atGoal: true, assist: 'none' }, true, 0)
    expect(phase).toEqual({ kind: 'reveal', beat: 'show' })
    expect(showingGift(phase)).toBe(true)
    phase = fold(phase, { atGoal: true, assist: 'none' }, false, 1.4)
    expect(phase).toEqual({ kind: 'letter' })
    expect(fold({ kind: 'title' }, { atGoal: true, assist: 'none' }, true, 9)).toEqual({ kind: 'title' })
    expect(fold({ kind: 'assist' }, { atGoal: true, assist: 'none' }, false, 0)).toEqual({
      kind: 'reveal',
      beat: 'prompt',
    })
    expect(screenOf({ kind: 'reveal', beat: 'prompt' })).toBe('play')
    expect(screenOf({ kind: 'assist' })).toBe('play')
  })
})
