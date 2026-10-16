import type { Env } from '../env'
import { MockModerator, type Moderator } from './moderation'
import { MockNotifier, type Notifier } from './notify'
import { SandboxMockVerifier, type PurchaseVerifier } from './purchase'

export type Services = {
  moderator: Moderator
  purchases: PurchaseVerifier
  notifier: Notifier
  now: () => number
}

export class ServiceConfigError extends Error {}

function unavailable(kind: string, name: string): never {
  throw new ServiceConfigError(`${kind} provider "${name}" is not available`)
}

/**
 * Picks providers from vars. Unknown names fail closed instead of silently using a mock, and only
 * when a request actually needs that provider, so reading published gifts keeps working.
 */
export function createServices(env: Env, now: () => number = Date.now): Services {
  let moderator: Moderator | undefined
  let purchases: PurchaseVerifier | undefined
  let notifier: Notifier | undefined
  return {
    get moderator() {
      moderator ??= env.MODERATION === 'mock' ? new MockModerator() : unavailable('moderation', env.MODERATION)
      return moderator
    },
    get purchases() {
      purchases ??= env.PURCHASE === 'sandbox-mock' ? new SandboxMockVerifier() : unavailable('purchase', env.PURCHASE)
      return purchases
    },
    get notifier() {
      notifier ??= env.NOTIFIER === 'mock' ? new MockNotifier(env.DB, now) : unavailable('notifier', env.NOTIFIER)
      return notifier
    },
    now,
  }
}

export type { Moderator, Verdict } from './moderation'
export type { Notifier, PushMessage } from './notify'
export type { PurchaseProof, PurchaseResult, PurchaseVerifier } from './purchase'
