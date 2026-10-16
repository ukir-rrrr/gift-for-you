import type { Difficulty } from '@gfy/schema'

export type ObstacleFill =
  | { type: 'none' }
  | { type: 'thorns'; w: number }
  | { type: 'gap'; w: number }
  | { type: 'moving-platform'; w: number; travel: number; period: number }
  | { type: 'steps'; lifts: readonly number[] }
  | { type: 'walker'; travel: number; period: number }

export type ObstaclePreset = {
  id: string
  difficulty: Difficulty
  fills: Record<string, ObstacleFill>
}

const SLOT_IDS = ['obs-1', 'obs-2', 'obs-3', 'obs-4', 'obs-5', 'obs-6', 'obs-7', 'obs-8'] as const

function fills(partial: Record<string, ObstacleFill>): Record<string, ObstacleFill> {
  const all: Record<string, ObstacleFill> = {}
  for (const id of SLOT_IDS) all[id] = partial[id] ?? { type: 'none' }
  return all
}

const thorn = (w: number): ObstacleFill => ({ type: 'thorns', w })
const gap = (w: number): ObstacleFill => ({ type: 'gap', w })
const platform = (period: number, travel = 28): ObstacleFill => ({
  type: 'moving-platform',
  w: 36,
  travel,
  period,
})
const steps = (...lifts: number[]): ObstacleFill => ({ type: 'steps', lifts })
const walker = (period: number, travel = 22): ObstacleFill => ({ type: 'walker', travel, period })

export const PRESETS: readonly ObstaclePreset[] = [
  {
    id: 'preset-easy',
    difficulty: 'easy',
    fills: fills({
      'obs-1': steps(16),
      'obs-2': walker(3.6),
      'obs-4': platform(3.2),
      'obs-8': thorn(16),
    }),
  },
  {
    id: 'preset-normal',
    difficulty: 'normal',
    fills: fills({
      'obs-1': thorn(16),
      'obs-2': gap(24),
      'obs-3': steps(16, 24),
      'obs-4': platform(2.8),
      'obs-5': gap(24),
      'obs-6': walker(3.0),
      'obs-7': platform(2.8),
      'obs-8': thorn(16),
    }),
  },
  {
    id: 'preset-hard',
    difficulty: 'hard',
    fills: fills({
      'obs-1': gap(24),
      'obs-2': thorn(16),
      'obs-3': gap(24),
      'obs-4': platform(1.8, 28),
      'obs-5': gap(24),
      'obs-6': walker(2.6, 20),
      'obs-7': platform(1.8, 28),
      'obs-8': thorn(16),
    }),
  },
]

export function presetById(id: string): ObstaclePreset {
  const preset = PRESETS.find((entry) => entry.id === id)
  if (!preset) throw new Error(`unknown preset ${id}`)
  return preset
}

export function presetForDifficulty(difficulty: Difficulty): ObstaclePreset {
  const preset = PRESETS.find((entry) => entry.difficulty === difficulty)
  if (!preset) throw new Error(`unknown difficulty ${difficulty}`)
  return preset
}
