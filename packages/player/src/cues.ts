export type Cue = 'jump' | 'coin' | 'miss' | 'stomp' | 'goal'

export type CueView = {
  fails: number
  collected: readonly string[]
  stomped: readonly string[]
  grounded: boolean
  vy: number
  atGoal: boolean
}

/** Sound cues between two frames of the sim. Pure so the mapping can be tested without audio. */
export function cuesBetween(prev: CueView | null, next: CueView): Cue[] {
  if (!prev) return []
  const cues: Cue[] = []
  if (next.fails > prev.fails) cues.push('miss')
  if (next.collected.length > prev.collected.length) cues.push('coin')
  const stomped = next.stomped.length > prev.stomped.length
  if (stomped) cues.push('stomp')
  else if (prev.grounded && !next.grounded && next.vy < 0 && next.fails === prev.fails) cues.push('jump')
  if (next.atGoal && !prev.atGoal) cues.push('goal')
  return cues
}

export type Settings = { muted: boolean; reduceFlash: boolean }

const settingsKey = 'gfy-settings'

/** Mute and flash choices survive a reload. Storage failures fall back to the defaults. */
export function loadSettings(defaults: Settings, store: Pick<Storage, 'getItem'> | null): Settings {
  try {
    const raw = store?.getItem(settingsKey)
    if (!raw) return defaults
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      muted: typeof parsed.muted === 'boolean' ? parsed.muted : defaults.muted,
      reduceFlash: typeof parsed.reduceFlash === 'boolean' ? parsed.reduceFlash : defaults.reduceFlash,
    }
  } catch {
    return defaults
  }
}

export function saveSettings(settings: Settings, store: Pick<Storage, 'setItem'> | null) {
  try {
    store?.setItem(settingsKey, JSON.stringify(settings))
  } catch {
    // keep playing with the in-memory choice
  }
}
