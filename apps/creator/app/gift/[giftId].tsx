import { useLocalSearchParams, useRouter } from 'expo-router'
import { useEffect, useRef, useState, type ComponentRef } from 'react'
import { Text, View } from 'react-native'
import { QrCode } from '../../src/components/QrCode'
import { Body, Button, Card, colors, Notice, Screen, Title } from '../../src/components/ui'
import { describeError, type RemoteGift } from '../../src/lib/api'
import { expiresLabel } from '../../src/lib/qr'
import { loadHistory, type LocalGift } from '../../src/lib/storage'
import { registerPush, type PushState } from '../../src/native/push'
import { exportQrCard } from '../../src/native/qrExport'
import { copyText, shareLink } from '../../src/native/share'
import { useApp } from '../../src/state/app'

const PUSH_TEXT: Record<PushState, string> = {
  registered: '開封とゴールを通知でお知らせします（それぞれ1回）',
  denied: '通知が許可されていません。設定から許可すると、開封とゴールを知らせます',
  unconfigured: 'このビルドではプッシュ通知を使えません。作成履歴で開封とゴールを確認できます',
  failed: '通知の登録に失敗しました。作成履歴で開封とゴールを確認できます',
}

/** F2-08 result (link, QR, share sheet, revoke code), F2-10 revoke, F2-12 QR card. */
export default function GiftScreen() {
  const router = useRouter()
  const { giftId } = useLocalSearchParams<{ giftId: string }>()
  const { api, kv, published } = useApp()
  const fresh = published?.giftId === giftId ? published : null
  const [local, setLocal] = useState<LocalGift | null>(null)
  const [remote, setRemote] = useState<RemoteGift | null>(null)
  const [message, setMessage] = useState('')
  const [push, setPush] = useState<PushState | null>(null)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const card = useRef<ComponentRef<typeof View>>(null)

  useEffect(() => {
    void loadHistory(kv).then((list) => setLocal(list.find((entry) => entry.giftId === giftId) ?? null))
    void api
      .listGifts()
      .then((list) => setRemote(list.find((entry) => entry.giftId === giftId) ?? null))
      .catch(() => setRemote(null))
  }, [api, kv, giftId])

  // F2-09: ask for notifications right after publishing, when the sender wants to know.
  useEffect(() => {
    if (fresh) void registerPush(api).then(setPush)
  }, [api, fresh])

  const url = fresh?.url ?? local?.url ?? remote?.url ?? null
  const toName = fresh?.toName ?? local?.toName ?? remote?.toName ?? ''
  const expiresAt = fresh?.expiresAt ?? local?.expiresAt ?? (remote?.expiresAt ? new Date(remote.expiresAt).toISOString() : null)
  const status = revoked ? 'revoked' : (remote?.status ?? (fresh ? 'published' : null))
  const live = status === 'published' && url

  async function revoke() {
    try {
      await api.revoke(giftId)
      setRevoked(true)
      setConfirmRevoke(false)
      setMessage('失効しました。リンクは開けなくなり、写真もサーバーから消えました。')
    } catch (error) {
      setMessage(describeError(error))
    }
  }

  return (
    <Screen testID="gift-screen">
      <Title>{toName ? `${toName}へのギフト` : 'ギフト'}</Title>
      {status === 'revoked' ? <Notice tone="error" testID="gift-revoked">失効済みです。写真も消えています。</Notice> : null}
      {status === 'expired' ? <Notice tone="warn">期限が切れました。写真も消えています。</Notice> : null}
      {fresh ? (
        <Notice tone="ok" testID="published">
          公開しました。リンクを送ってください。
        </Notice>
      ) : null}

      {live ? (
        <>
          <Card>
            <Text selectable style={{ fontSize: 16, color: colors.blue }} testID="share-url">
              {url}
            </Text>
            {expiresAt ? <Body muted>{expiresLabel(expiresAt)}ひらけます</Body> : null}
            <Button
              label="共有する"
              testID="share"
              onPress={() =>
                void shareLink(toName, url).then((result) => {
                  if (result === 'copied') setMessage('リンクをコピーしました')
                })
              }
            />
            <Button label="リンクをコピー" kind="secondary" testID="copy-url" onPress={() => void copyText(url).then(() => setMessage('リンクをコピーしました'))} />
          </Card>
          <View ref={card} collapsable={false} style={{ alignItems: 'center', backgroundColor: '#d8c9b0', padding: 16, borderRadius: 16, gap: 8 }} testID="qr-card">
            <Text style={{ fontSize: 18, fontWeight: '700', color: colors.ink }}>{toName}へ　ちょっとした冒険を</Text>
            <QrCode value={url} testID="qr" />
            <Text style={{ fontSize: 12, color: colors.ink }}>カメラで読み取ってね{expiresAt ? `・${expiresLabel(expiresAt)}` : ''}</Text>
          </View>
          <Button
            label="QRカードを保存"
            kind="secondary"
            testID="export-qr"
            onPress={() =>
              void exportQrCard({ url, toName, expiresAt: expiresAt ?? new Date().toISOString() }, card).then((result) =>
                setMessage(result === 'shared' ? 'QRカードを書き出しました' : 'この端末では書き出せません'),
              )
            }
          />
        </>
      ) : null}

      {message ? <Notice testID="gift-message">{message}</Notice> : null}
      {push ? <Body muted>{PUSH_TEXT[push]}</Body> : null}

      {fresh && live ? (
        <Card style={{ borderColor: colors.accent }}>
          <Text style={{ fontWeight: '700', color: colors.accent }}>失効コード（この画面でしか表示されません）</Text>
          <Text selectable style={{ fontSize: 24, letterSpacing: 2, fontWeight: '700', color: colors.ink }} testID="revoke-code">
            {fresh.revokeCode}
          </Text>
          <Text selectable style={{ color: colors.blue }} testID="revoke-url">
            {fresh.revokeUrl}
          </Text>
          <Body muted>スマホをなくしても、このURLでコードを入れればどのブラウザからでも失効できます。メモしておいてください。</Body>
          <Button label="コードとURLをコピー" kind="secondary" onPress={() => void copyText(`${fresh.revokeCode}\n${fresh.revokeUrl}`).then(() => setMessage('失効コードをコピーしました'))} />
        </Card>
      ) : null}

      {remote && status === 'published' ? (
        <Card>
          <Body testID="gift-progress">
            {remote.openedAt ? '開封されました' : 'まだ開かれていません'}
            {remote.goalAt ? '・ゴールしました' : ''}
          </Body>
        </Card>
      ) : null}

      {status === 'published' ? (
        confirmRevoke ? (
          <Card>
            <Body>失効すると、リンクは二度と開けず、写真もサーバーから消えます。</Body>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Button label="やめる" kind="secondary" onPress={() => setConfirmRevoke(false)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button label="失効する" kind="danger" testID="confirm-revoke" onPress={() => void revoke()} />
              </View>
            </View>
          </Card>
        ) : (
          <Button label="失効して削除" kind="danger" testID="revoke" onPress={() => setConfirmRevoke(true)} />
        )
      ) : null}
      <Button label="ホームへ" kind="plain" testID="go-home" onPress={() => router.replace('/')} />
    </Screen>
  )
}
