export type PushMessage = { token: string; title: string; body: string; data: Record<string, string> }

export type PushOutcome = 'sent' | 'gone'

export interface Notifier {
  /** "gone" means the token no longer reaches a device and should be forgotten. */
  send(message: PushMessage): Promise<PushOutcome>
}

/** Writes what would be sent to D1 so local runs and e2e can read it back. */
export class MockNotifier implements Notifier {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number,
  ) {}

  async send(message: PushMessage): Promise<PushOutcome> {
    await this.db
      .prepare('INSERT INTO mock_push_outbox (token, title, body, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(message.token, message.title, message.body, JSON.stringify(message.data), this.now())
      .run()
    return 'sent'
  }
}

type Fetch = typeof fetch

/**
 * Expo's push service in front of APNs and FCM. The APNs key and FCM credentials live in the EAS
 * project, not here; EXPO_ACCESS_TOKEN is only needed when "enhanced push security" is on.
 */
export class ExpoNotifier implements Notifier {
  constructor(
    private readonly accessToken: string | undefined,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {}

  async send(message: PushMessage): Promise<PushOutcome> {
    const headers: Record<string, string> = { 'content-type': 'application/json', accept: 'application/json' }
    if (this.accessToken) headers.authorization = `Bearer ${this.accessToken}`
    const res = await this.fetchImpl('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify({ to: message.token, title: message.title, body: message.body, data: message.data, sound: 'default' }),
    })
    if (!res.ok) throw new Error(`expo push ${res.status}`)
    const body = (await res.json().catch(() => null)) as { data?: { status?: string; details?: { error?: string } } } | null
    if (body?.data?.status === 'error' && body.data.details?.error === 'DeviceNotRegistered') return 'gone'
    if (body?.data?.status !== 'ok') throw new Error('expo push rejected')
    return 'sent'
  }
}
