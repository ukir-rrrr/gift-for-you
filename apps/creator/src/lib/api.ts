import type { ShareJson } from '@gfy/schema'
import type { GiftContent } from './share'

export type PhotoVerdict = { ref: string; status: 'approved' | 'rejected'; reason?: string }

export type Published = { shareId: string; url: string; expiresAt: string; revokeCode: string; revokeUrl: string }

export type RemoteGift = {
  giftId: string
  status: 'published' | 'revoked' | 'expired'
  shareId: string | null
  url: string | null
  toName: string | null
  createdAt: number
  publishedAt: number | null
  expiresAt: number | null
  openedAt: number | null
  goalAt: number | null
  openedCount: number
  goalCount: number
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(`${status} ${code}`)
  }

  /** Photo refs the server named in a photo_rejected or photo_missing answer. */
  get refs(): string[] {
    return Array.isArray(this.detail.refs) ? (this.detail.refs as string[]) : []
  }
}

type Fetch = typeof fetch

export class Api {
  constructor(
    private readonly origin: string,
    private readonly deviceKey: () => Promise<string>,
    private readonly fetchImpl: Fetch = (...args) => fetch(...args),
  ) {}

  private async call<T>(method: string, path: string, body?: BodyInit, contentType?: string): Promise<T> {
    const headers: Record<string, string> = { authorization: `Device ${await this.deviceKey()}` }
    if (contentType) headers['content-type'] = contentType
    let res: Response
    try {
      res = await this.fetchImpl(`${this.origin}${path}`, { method, headers, body })
    } catch {
      throw new ApiError(0, 'offline')
    }
    const text = await res.text()
    let parsed: Record<string, unknown> = {}
    try {
      parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {}
    } catch {
      parsed = {}
    }
    if (!res.ok) throw new ApiError(res.status, typeof parsed.error === 'string' ? parsed.error : 'http', parsed)
    return parsed as T
  }

  createGift(): Promise<{ giftId: string }> {
    return this.call('POST', '/api/gifts')
  }

  uploadPhoto(giftId: string, ref: string, jpeg: Uint8Array): Promise<PhotoVerdict> {
    // Copy into a plain ArrayBuffer so every fetch implementation accepts the body.
    const body = jpeg.slice().buffer as ArrayBuffer
    return this.call('PUT', `/api/gifts/${encodeURIComponent(giftId)}/photos/${encodeURIComponent(ref)}`, body, 'image/jpeg')
  }

  putContent(giftId: string, content: GiftContent): Promise<{ ok: true; share: ShareJson }> {
    return this.call('PUT', `/api/gifts/${encodeURIComponent(giftId)}/content`, JSON.stringify(content), 'application/json')
  }

  purchase(giftId: string, proof: { platform: string; transactionId: string }): Promise<{ ok: true }> {
    return this.call('POST', `/api/gifts/${encodeURIComponent(giftId)}/purchase`, JSON.stringify(proof), 'application/json')
  }

  publish(giftId: string): Promise<Published> {
    return this.call('POST', `/api/gifts/${encodeURIComponent(giftId)}/publish`)
  }

  async listGifts(): Promise<RemoteGift[]> {
    return (await this.call<{ gifts: RemoteGift[] }>('GET', '/api/gifts')).gifts
  }

  async revoke(giftId: string): Promise<void> {
    await this.call('DELETE', `/api/gifts/${encodeURIComponent(giftId)}`)
  }

  async registerPush(token: string, platform: string): Promise<void> {
    await this.call('PUT', '/api/devices/push', JSON.stringify({ token, platform }), 'application/json')
  }
}

/** One line of Japanese for an API failure. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'うまくいきませんでした。もう一度お試しください'
  switch (error.code) {
    case 'offline':
      return 'サーバーにつながりません。通信を確かめてください'
    case 'photo_missing_local':
      return '写真がこの端末に見つかりません。写真を選び直してください'
    case 'photo_rejected':
      return '公開できない写真があります。別の写真に差し替えてください'
    case 'text_rejected':
      return '公開できない言葉が含まれています。文章を見直してください'
    case 'too_many_gifts':
      return '今日はこれ以上作れません。あした試してください'
    case 'purchase_invalid':
      return '購入を確認できませんでした'
    case 'too_large':
    case 'too_many_pixels':
    case 'not_jpeg':
      return '写真を読み込めませんでした。別の写真を選んでください'
    case 'not_configured':
      return 'サーバーの準備ができていません'
    default:
      return `うまくいきませんでした（${error.code}）`
  }
}
