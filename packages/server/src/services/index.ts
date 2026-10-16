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

/** Picks providers from vars. Unknown names fail closed instead of silently using a mock. */
export function createServices(env: Env, now: () => number = Date.now): Services {
  if (env.MODERATION !== 'mock') throw new ServiceConfigError(`moderation provider "${env.MODERATION}" is not available`)
  if (env.PURCHASE !== 'sandbox-mock') throw new ServiceConfigError(`purchase provider "${env.PURCHASE}" is not available`)
  if (env.NOTIFIER !== 'mock') throw new ServiceConfigError(`notifier "${env.NOTIFIER}" is not available`)
  return {
    moderator: new MockModerator(),
    purchases: new SandboxMockVerifier(),
    notifier: new MockNotifier(env.DB, now),
    now,
  }
}

export type { Moderator, Verdict } from './moderation'
export type { Notifier, PushMessage } from './notify'
export type { PurchaseProof, PurchaseResult, PurchaseVerifier } from './purchase'
