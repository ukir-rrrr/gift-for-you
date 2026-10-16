export type PushMessage = { token: string; title: string; body: string; data: Record<string, string> }

/** APNs / FCM (or Expo's push service in front of them). Needs credentials, so only a mock runs here. */
export interface Notifier {
  send(message: PushMessage): Promise<void>
}

/** Writes what would be sent to D1 so local runs and e2e can read it back. */
export class MockNotifier implements Notifier {
  constructor(
    private readonly db: D1Database,
    private readonly now: () => number,
  ) {}

  async send(message: PushMessage): Promise<void> {
    await this.db
      .prepare('INSERT INTO mock_push_outbox (token, title, body, data, created_at) VALUES (?, ?, ?, ?, ?)')
      .bind(message.token, message.title, message.body, JSON.stringify(message.data), this.now())
      .run()
  }
}
