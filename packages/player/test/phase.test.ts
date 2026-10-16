import { describe, expect, it } from 'vitest'
import { BEAT_SECONDS, fold, revealBeat, screenOf, showingGift, typedLetter, type SessionPhase } from '../src/phase'

const idle = { atGoal: false, assist: 'none' as const }
const goal = { atGoal: true, assist: 'none' as const }

describe('session phase', () => {
  it('folds play, assist, reveal, and letter from the snapshot', () => {
    let phase: SessionPhase = { kind: 'play' }
    phase = fold(phase, idle, false, 0)
    expect(phase).toEqual({ kind: 'play' })
    phase = fold(phase, { atGoal: false, assist: 'offered' }, false, 0)
    expect(phase).toEqual({ kind: 'assist' })
    phase = fold(phase, { atGoal: false, assist: 'invincible' }, false, 0)
    expect(phase).toEqual({ kind: 'play' })
    phase = fold(phase, goal, false, 0)
    expect(phase).toEqual({ kind: 'reveal', beat: 'prompt' })
    expect(fold(phase, goal, false, 99)).toEqual(phase)
    expect(fold({ kind: 'title' }, goal, true, 9)).toEqual({ kind: 'title' })
    expect(fold({ kind: 'assist' }, goal, false, 0)).toEqual({ kind: 'reveal', beat: 'prompt' })
    expect(screenOf({ kind: 'reveal', beat: 'prompt' })).toBe('play')
    expect(screenOf({ kind: 'assist' })).toBe('play')
  })

  it('opens the gift in three timed beats before the letter', () => {
    let phase: SessionPhase = fold({ kind: 'reveal', beat: 'prompt' }, goal, true, 0)
    const beats = [revealBeat(phase)]
    for (const beat of ['shake', 'burst', 'show'] as const) {
      expect(revealBeat(phase)).toBe(beat)
      expect(fold(phase, goal, false, BEAT_SECONDS[beat] - 0.01)).toEqual(phase)
      expect(showingGift(phase)).toBe(beat === 'show')
      phase = fold(phase, goal, false, BEAT_SECONDS[beat])
      beats.push(revealBeat(phase))
    }
    expect(beats).toEqual(['shake', 'burst', 'show', null])
    expect(phase).toEqual({ kind: 'letter' })
  })
})

describe('typewriter', () => {
  it('types whole characters and reports when done', () => {
    expect(typedLetter('彩へ。', 0)).toEqual({ text: '', done: false })
    expect(typedLetter('彩へ。', 2 / 28)).toEqual({ text: '彩へ', done: false })
    expect(typedLetter('𠮷野', 1 / 28)).toEqual({ text: '𠮷', done: false })
    expect(typedLetter('彩へ。', 10)).toEqual({ text: '彩へ。', done: true })
  })
})
