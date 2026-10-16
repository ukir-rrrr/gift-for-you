import { z } from 'zod'
import { checkEgiftUrl } from './egift'
import { sanitizeDisplay, textLength } from './sanitize'

export type Difficulty = 'easy' | 'normal' | 'hard'

export type CatalogIndex = {
  templateIds: readonly string[]
  itemIds: readonly string[]
  revealIds: readonly string[]
  bgmIds: readonly string[]
  hairIds: readonly string[]
  skinIds: readonly string[]
  outfitIds: readonly string[]
  palette: readonly string[]
  presetsByDifficulty: Record<Difficulty, readonly string[]>
}

const boundedText = (max: number, min = 0) =>
  z
    .string()
    .transform(sanitizeDisplay)
    .refine((value) => {
      const length = textLength(value)
      return length >= min && length <= max
    })

const displayName = boundedText(12, 1)
const message = boundedText(40, 0)
const label = boundedText(20, 1)

export const shareJsonSchema = z
  .object({
    $schema: z.string().optional(),
    schemaVersion: z.literal(1),
    mode: z.literal('platformer'),
    catalogVersion: z.string().min(1),
    locale: z.literal('ja'),
    from: z.object({ displayName }),
    to: z.object({ displayName }),
    course: z.object({
      templateId: z.string().min(1),
      difficulty: z.enum(['easy', 'normal', 'hard']),
      obstaclePresets: z.array(z.string().min(1)).min(1).max(8),
      assist: z.object({
        autoAssistAfterFails: z.number().int().min(1).max(10),
        easyModeDefault: z.boolean(),
      }),
    }),
    memoryCoins: z
      .array(
        z
          .object({
            order: z.number().int().min(1).max(10),
            photoRef: z.string().min(1).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
            message,
          })
          )
      .max(10),
    goal: z.object({
      revealEffectId: z.string().min(1),
      giftItem: z.object({
        itemId: z.string().min(1),
        label,
      }),
      letter: z.object({ present: z.boolean() }),
      egift: z.object({
        present: z.boolean(),
        kind: z.enum(['url', 'code']).optional(),
        domain: z.string().optional(),
        passphrase: z.boolean().optional(),
        url: z.string().optional(),
      }),
    }),
    options: z
      .object({
        recordingModeDefault: z.boolean().optional(),
        bgmId: z.string().optional(),
      })
      .optional(),
    hero: z
      .object({
        hairId: z.string(),
        skinId: z.string(),
        outfitId: z.string(),
        colors: z
          .object({
            hair: z.string().optional(),
            skin: z.string().optional(),
            outfit: z.string().optional(),
          })
          .optional(),
      })
      .optional(),
    expiresAt: z.string().datetime({ offset: true }).optional(),
  })
  .strip()

export type ShareJson = z.infer<typeof shareJsonSchema>

export type ParseResult = { ok: true; value: ShareJson } | { ok: false; issues: string[] }

function includes(list: readonly string[], id: string): boolean {
  return list.includes(id)
}

export function parseShareJson(input: unknown, index: CatalogIndex): ParseResult {
  const parsed = shareJsonSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => issue.message) }
  }
  const value = parsed.data
  const issues: string[] = []
  if (!includes(index.templateIds, value.course.templateId)) issues.push('unknown template')
  if (!includes(index.itemIds, value.goal.giftItem.itemId)) issues.push('unknown gift item')
  if (!includes(index.revealIds, value.goal.revealEffectId)) issues.push('unknown reveal')
  if (value.options?.bgmId && !includes(index.bgmIds, value.options.bgmId)) issues.push('unknown bgm')
  const expected = index.presetsByDifficulty[value.course.difficulty]
  const got = value.course.obstaclePresets
  if (got.length !== expected.length || got.some((id, i) => id !== expected[i])) {
    issues.push('presets do not match difficulty')
  }
  for (const id of got) {
    const known = Object.values(index.presetsByDifficulty).some((list) => list.includes(id))
    if (!known) issues.push('unknown preset')
  }
  const orders = new Set<number>()
  for (const coin of value.memoryCoins) {
    if (orders.has(coin.order)) issues.push('duplicate coin order')
    orders.add(coin.order)
  }
  if (value.hero) {
    if (!includes(index.hairIds, value.hero.hairId)) issues.push('unknown hair')
    if (!includes(index.skinIds, value.hero.skinId)) issues.push('unknown skin')
    if (!includes(index.outfitIds, value.hero.outfitId)) issues.push('unknown outfit')
    const colors = [value.hero.colors?.hair, value.hero.colors?.skin, value.hero.colors?.outfit]
    for (const color of colors) {
      if (color && !index.palette.includes(color.toLowerCase())) issues.push('color outside palette')
    }
  }
  if (value.goal.egift.url) {
    const check = checkEgiftUrl(value.goal.egift.url)
    if (check.status === 'block') issues.push(`egift ${check.reason}`)
  }
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, value }
}

export function isExpired(value: ShareJson, now: Date): boolean {
  if (!value.expiresAt) return false
  return new Date(value.expiresAt).getTime() <= now.getTime()
}
