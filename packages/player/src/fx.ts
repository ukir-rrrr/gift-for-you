const GLOW_HZ = 0.4

export function glowFrequency(reduceFlash: boolean): number {
  return reduceFlash ? 0 : GLOW_HZ
}

export function glowAlpha(time: number, reduceFlash: boolean): number {
  if (reduceFlash) return 1
  return 0.72 + 0.28 * Math.sin(time * Math.PI * 2 * GLOW_HZ)
}

export function glowPulseCount(seconds: number): number {
  return GLOW_HZ * seconds
}
