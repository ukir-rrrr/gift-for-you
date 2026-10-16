export type SignInProvider = 'apple' | 'google' | 'mock'

export type SignInResult = { ok: true; provider: SignInProvider; subject: string } | { ok: false; reason: string }

/** Checks an ID token from Sign in with Apple or Google and returns the stable subject. */
export interface SignInVerifier {
  verify(provider: string, idToken: string): Promise<SignInResult>
}

/** Accepts "mock:<subject>" tokens for provider "mock". Local runs and e2e only. */
export class MockSignInVerifier implements SignInVerifier {
  async verify(provider: string, idToken: string): Promise<SignInResult> {
    const match = idToken.match(/^mock:([A-Za-z0-9_-]{4,64})$/)
    if (provider !== 'mock' || !match) return { ok: false, reason: 'token' }
    return { ok: true, provider: 'mock', subject: match[1] }
  }
}

type Fetch = typeof fetch
type Jwk = JsonWebKey & { kid?: string }

const ISSUERS: Record<'apple' | 'google', { jwks: string; issuers: string[] }> = {
  apple: { jwks: 'https://appleid.apple.com/auth/keys', issuers: ['https://appleid.apple.com'] },
  google: { jwks: 'https://www.googleapis.com/oauth2/v3/certs', issuers: ['https://accounts.google.com', 'accounts.google.com'] },
}

function b64urlBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=')
  const binary = atob(base64)
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0))
}

function b64urlJson(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(new TextDecoder().decode(b64urlBytes(value))) as Record<string, unknown>
  } catch {
    return null
  }
}

/**
 * Verifies RS256 ID tokens against the provider's published keys: signature, issuer, audience
 * (APPLE_AUDIENCE: the bundle id; GOOGLE_AUDIENCES: OAuth client ids), and expiry.
 */
export class OidcSignInVerifier implements SignInVerifier {
  constructor(
    private readonly audiences: Record<'apple' | 'google', string[]>,
    private readonly now: () => number = Date.now,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {}

  async verify(provider: string, idToken: string): Promise<SignInResult> {
    if (provider !== 'apple' && provider !== 'google') return { ok: false, reason: 'provider' }
    const audiences = this.audiences[provider]
    if (audiences.length === 0) return { ok: false, reason: 'provider' }
    const parts = idToken.split('.')
    if (parts.length !== 3) return { ok: false, reason: 'token' }
    const header = b64urlJson(parts[0])
    const claims = b64urlJson(parts[1])
    if (!header || !claims || header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, reason: 'token' }
    const res = await this.fetchImpl(ISSUERS[provider].jwks)
    if (!res.ok) return { ok: false, reason: 'keys' }
    const { keys } = (await res.json()) as { keys: Jwk[] }
    const jwk = keys.find((key) => key.kid === header.kid)
    if (!jwk) return { ok: false, reason: 'token' }
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify'])
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    const valid = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64urlBytes(parts[2]), signed)
    if (!valid) return { ok: false, reason: 'signature' }
    if (!ISSUERS[provider].issuers.includes(String(claims.iss))) return { ok: false, reason: 'issuer' }
    const aud = Array.isArray(claims.aud) ? claims.aud.map(String) : [String(claims.aud)]
    if (!aud.some((value) => audiences.includes(value))) return { ok: false, reason: 'audience' }
    if (typeof claims.exp !== 'number' || claims.exp * 1000 <= this.now()) return { ok: false, reason: 'expired' }
    if (typeof claims.sub !== 'string' || !claims.sub) return { ok: false, reason: 'token' }
    return { ok: true, provider, subject: claims.sub }
  }
}
