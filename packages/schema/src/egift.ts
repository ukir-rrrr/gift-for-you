const ALLOWED_DOMAINS = ['giftee.com', 'amazon.co.jp', 'gift.line.me', 'starbucks.co.jp', 'gift.example'] as const

const SHORTENERS = new Set([
  'bit.ly',
  'bitly.com',
  'tinyurl.com',
  't.co',
  'goo.gl',
  'is.gd',
  'x.gd',
  'buff.ly',
  'ow.ly',
])

export type EgiftCheck =
  | { status: 'allow'; domain: string }
  | { status: 'warn'; domain: string }
  | { status: 'block'; domain: string; reason: 'scheme' | 'shortener' }

export function allowedDomains(): readonly string[] {
  return ALLOWED_DOMAINS
}

function bareHost(hostname: string): string {
  return hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
}

function hostOrSuffix(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`)
}

export function domainAllowed(hostname: string, extra: readonly string[] = []): boolean {
  const host = bareHost(hostname)
  const list = [...ALLOWED_DOMAINS, ...extra.map(bareHost)]
  return list.some((domain) => hostOrSuffix(host, domain))
}

export function checkEgiftUrl(url: string, extraAllow: readonly string[] = []): EgiftCheck {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { status: 'block', domain: '', reason: 'scheme' }
  }
  if (parsed.protocol !== 'https:') {
    return { status: 'block', domain: parsed.hostname, reason: 'scheme' }
  }
  const domain = bareHost(parsed.hostname)
  if ([...SHORTENERS].some((shortener) => hostOrSuffix(domain, shortener))) {
    return { status: 'block', domain, reason: 'shortener' }
  }
  if (domainAllowed(domain, extraAllow)) {
    return { status: 'allow', domain }
  }
  return { status: 'warn', domain }
}
