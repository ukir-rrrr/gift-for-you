export function textLength(value: string): number {
  return [...value].length
}

/** Drop control characters and emoji. Callers render the remainder as text. */
export function sanitizeDisplay(value: string): string {
  const noControls = value.replace(/[\u0000-\u001F\u007F]/g, '')
  return noControls.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200D\uFE0F]/gu, '')
}
