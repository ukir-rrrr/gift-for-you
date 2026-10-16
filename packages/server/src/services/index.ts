import type { Env } from '../env'
import { MockModerator, VisionModerator, type Moderator } from './moderation'
import { ExpoNotifier, MockNotifier, type Notifier } from './notify'
import { RevenueCatVerifier, SandboxMockVerifier, type PurchaseVerifier } from './purchase'
import { MockSignInVerifier, OidcSignInVerifier, type SignInVerifier } from './signin'

export type Services = {
  moderator: Moderator
  purchases: PurchaseVerifier
  notifier: Notifier
  signIn: SignInVerifier
  now: () => number
}

export class ServiceConfigError extends Error {}

function unavailable(kind: string, name: string | undefined): never {
  throw new ServiceConfigError(`${kind} provider "${name ?? ''}" is not available`)
}

function need(value: string | undefined, name: string): string {
  if (!value) throw new ServiceConfigError(`${name} is not set`)
  return value
}

const list = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

/**
 * Picks providers from vars. Unknown names fail closed instead of silently using a mock, and only
 * when a request actually needs that provider, so reading published gifts keeps working.
 */
export function createServices(env: Env, now: () => number = Date.now): Services {
  let moderator: Moderator | undefined
  let purchases: PurchaseVerifier | undefined
  let notifier: Notifier | undefined
  let signIn: SignInVerifier | undefined
  return {
    get moderator() {
      moderator ??=
        env.MODERATION === 'mock'
          ? new MockModerator()
          : env.MODERATION === 'vision'
            ? new VisionModerator(need(env.GOOGLE_VISION_API_KEY, 'GOOGLE_VISION_API_KEY'))
            : unavailable('moderation', env.MODERATION)
      return moderator
    },
    get purchases() {
      purchases ??=
        env.PURCHASE === 'sandbox-mock'
          ? new SandboxMockVerifier(now)
          : env.PURCHASE === 'revenuecat'
            ? new RevenueCatVerifier(need(env.REVENUECAT_SECRET_KEY, 'REVENUECAT_SECRET_KEY'), env.REVENUECAT_ALLOW_SANDBOX !== '0')
            : unavailable('purchase', env.PURCHASE)
      return purchases
    },
    get notifier() {
      notifier ??=
        env.NOTIFIER === 'mock'
          ? new MockNotifier(env.DB, now)
          : env.NOTIFIER === 'expo'
            ? new ExpoNotifier(env.EXPO_ACCESS_TOKEN)
            : unavailable('notifier', env.NOTIFIER)
      return notifier
    },
    get signIn() {
      signIn ??=
        env.SIGNIN === 'mock'
          ? new MockSignInVerifier()
          : env.SIGNIN === 'oidc'
            ? new OidcSignInVerifier({ apple: list(env.APPLE_AUDIENCE), google: list(env.GOOGLE_AUDIENCES) }, now)
            : unavailable('sign-in', env.SIGNIN)
      return signIn
    },
    now,
  }
}

export { ModerationUnavailable } from './moderation'
export type { Moderator, Verdict } from './moderation'
export type { Notifier, PushMessage, PushOutcome } from './notify'
export { appUserIdFor, PurchaseUnavailable } from './purchase'
export type { PurchaseProof, PurchaseResult, PurchaseVerifier, VerifiedPurchase } from './purchase'
export type { SignInResult, SignInVerifier } from './signin'
