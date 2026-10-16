import { z } from 'zod'
import { checkEgiftUrl } from './egift'
import { sanitizeDisplay, textLength } from './sanitize'

const letterBody = z
  .string()
  .transform(sanitizeDisplay)
  .refine((value) => {
    const length = textLength(value)
    return length >= 1 && length <= 500
  })

export const revealJsonSchema = z
  .object({
    letter: z.object({ body: letterBody }),
    egift: z
      .object({
        kind: z.enum(['url', 'code']),
        url: z.string().optional(),
        code: z
          .string()
          .max(80)
          .transform(sanitizeDisplay)
          .optional(),
      })
      .optional(),
  })
  .strip()

export type RevealJson = z.infer<typeof revealJsonSchema>

export type ParseRevealResult = { ok: true; value: RevealJson } | { ok: false; issues: string[] }

export function parseRevealJson(input: unknown): ParseRevealResult {
  const parsed = revealJsonSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) }
  }
  const value = parsed.data
  if (value.egift?.url) {
    const check = checkEgiftUrl(value.egift.url)
    if (check.status === 'block') return { ok: false, issues: [`egift ${check.reason}`] }
  }
  return { ok: true, value }
}
