export const INTERNAL_W = 180
export const INTERNAL_H = 320

export function integerScale(viewportW: number, viewportH: number, controlsH: number): number {
  const availH = Math.max(1, viewportH - controlsH)
  return Math.max(1, Math.floor(Math.min(viewportW / INTERNAL_W, availH / INTERNAL_H)))
}
