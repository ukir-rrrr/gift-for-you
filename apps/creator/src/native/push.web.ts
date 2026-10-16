import type { Api } from '../lib/api'
import { PUSH_MOCK } from './config'

export type PushState = 'registered' | 'denied' | 'unconfigured' | 'failed'

/** The web build has no push; local runs and e2e register a mock token instead. */
export async function registerPush(api: Api): Promise<PushState> {
  if (!PUSH_MOCK) return 'unconfigured'
  try {
    await api.registerPush(`mock-web-${Date.now().toString(36)}`, 'mock')
    return 'registered'
  } catch {
    return 'failed'
  }
}
