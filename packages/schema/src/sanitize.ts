export function textLength(value: string): number {
  return [...value].length
}

/** Drop control characters and emoji. Callers render the remainder as text. Newlines stay so letters can wrap. */
export function sanitizeDisplay(value: string): string {
  const newlines = value.replace(/\r\n?/g, '\n')
  const noControls = newlines.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '')
  return noControls.replace(/\p{Extended_Pictographic}|\p{Regional_Indicator}|[\u200D\uFE0F]/gu, '')
}
