import * as AppleAuthentication from 'expo-apple-authentication'
import { Platform } from 'react-native'
import { SIGNIN_MOCK } from './config'

export type SignInProvider = 'apple' | 'mock'

export type SignInToken = { provider: SignInProvider; idToken: string }

/** Providers this build can offer. Google sign-in needs a native module and OAuth ids (docs/phase3.md). */
export async function signInProviders(): Promise<SignInProvider[]> {
  if (SIGNIN_MOCK) return ['mock']
  if (Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync())) return ['apple']
  return []
}

/** Sign in with Apple. Only the ID token leaves the device; the server keeps a hash of its subject. */
export async function signIn(provider: SignInProvider): Promise<SignInToken | null> {
  if (provider === 'mock') return { provider, idToken: 'mock:e2e-user' }
  try {
    // No name or e-mail scope: the server only needs the stable subject.
    const credential = await AppleAuthentication.signInAsync({ requestedScopes: [] })
    return credential.identityToken ? { provider, idToken: credential.identityToken } : null
  } catch (error) {
    if ((error as { code?: string }).code === 'ERR_REQUEST_CANCELED') return null
    throw error
  }
}
