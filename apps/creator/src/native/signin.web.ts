import { SIGNIN_MOCK } from './config'

export type SignInProvider = 'apple' | 'mock'

export type SignInToken = { provider: SignInProvider; idToken: string }

/** The web build only offers the mock sign-in, for local runs and e2e. */
export async function signInProviders(): Promise<SignInProvider[]> {
  return SIGNIN_MOCK ? ['mock'] : []
}

export async function signIn(provider: SignInProvider): Promise<SignInToken | null> {
  return provider === 'mock' && SIGNIN_MOCK ? { provider, idToken: 'mock:e2e-user' } : null
}
