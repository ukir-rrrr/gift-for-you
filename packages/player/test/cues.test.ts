import { describe, expect, it } from 'vitest'
import { cuesBetween, loadSettings, saveSettings, type CueView } from '../src/cues'

const base: CueView = { fails: 0, collected: [], stomped: [], grounded: true, vy: 0, atGoal: false }

describe('sound cues', () => {
  it('maps sim changes to effects', () => {
    expect(cuesBetween(null, base)).toEqual([])
    expect(cuesBetween(base, base)).toEqual([])
    expect(cuesBetween(base, { ...base, grounded: false, vy: -200 })).toEqual(['jump'])
    expect(cuesBetween(base, { ...base, collected: ['coin-1'] })).toEqual(['coin'])
    expect(cuesBetween(base, { ...base, fails: 1 })).toEqual(['miss'])
    expect(cuesBetween({ ...base, grounded: false }, { ...base, grounded: false, vy: -150, stomped: ['w1'] })).toEqual(['stomp'])
    expect(cuesBetween(base, { ...base, atGoal: true })).toEqual(['goal'])
    // Walking off a ledge is not a jump.
    expect(cuesBetween(base, { ...base, grounded: false, vy: 10 })).toEqual([])
  })
})

describe('settings', () => {
  it('round-trips and falls back on bad storage', () => {
    const data = new Map<string, string>()
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    const defaults = { muted: false, reduceFlash: true }
    expect(loadSettings(defaults, store)).toEqual(defaults)
    saveSettings({ muted: true, reduceFlash: false }, store)
    expect(loadSettings(defaults, store)).toEqual({ muted: true, reduceFlash: false })
    data.set('gfy-settings', '{bad')
    expect(loadSettings(defaults, store)).toEqual(defaults)
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    expect(loadSettings(defaults, broken)).toEqual(defaults)
    expect(() => saveSettings(defaults, broken)).not.toThrow()
    expect(loadSettings(defaults, null)).toEqual(defaults)
  })
})
