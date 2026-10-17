import { PRICE_TIERS, tierById, type TierId } from '@gfy/schema'
import { useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { PlayerPreview } from '../../src/components/PlayerPreview'
import { Body, Button, Card, Choice, colors, Notice, Screen, styles } from '../../src/components/ui'
import { describeError } from '../../src/lib/api'
import { PUBLISH_STAGES, purchaseAndPublish, uploadAndModerate, type PublishStage } from '../../src/lib/publish'
import { fallbackProducts, PurchaseCancelled, type StoreProduct } from '../../src/lib/purchases'
import { buildContent, previewPayload } from '../../src/lib/share'
import { addHistory, clearDraft, loadPhoto } from '../../src/lib/storage'
import { appStore } from '../../src/native/store'
import { usePhotoUrls, useApp } from '../../src/state/app'

type Phase =
  | { kind: 'start' }
  | { kind: 'working'; stage: PublishStage; detail?: string }
  | { kind: 'rejected'; refs: string[]; message: string }
  | { kind: 'failed'; message: string; stage: PublishStage }
  | { kind: 'review'; giftId: string }
  | { kind: 'buy'; giftId: string }

/** F2-08: upload -> moderation -> preview -> sandbox purchase -> share id -> link, QR, share sheet. */
export default function PublishStep() {
  const router = useRouter()
  const { draft, dispatch, latestDraft, kv, api, setPublished, credits, refreshCredits } = useApp()
  const [tier, setTier] = useState<TierId>('standard')
  const [products, setProducts] = useState<StoreProduct[]>(fallbackProducts())
  const [buyNote, setBuyNote] = useState('')
  useEffect(() => {
    void appStore.products?.().then(setProducts)
  }, [])
  const built = useMemo(() => buildContent(draft), [draft])
  const urls = usePhotoUrls(draft.coins.map((coin) => coin.photoRef))
  const [phase, setPhase] = useState<Phase>({ kind: 'start' })

  const current: PublishStage =
    phase.kind === 'working' || phase.kind === 'failed'
      ? phase.stage
      : phase.kind === 'review'
        ? 'preview'
        : phase.kind === 'buy'
          ? 'purchase'
          : phase.kind === 'rejected'
            ? 'moderation'
            : 'upload'
  const currentIndex = PUBLISH_STAGES.findIndex((stage) => stage.id === current)

  if (!built.ok) {
    return (
      <Screen testID="step-publish">
        <Notice tone="error">まだ足りないところがあります。プレビューから戻って直してください。</Notice>
        <Button label="最初の画面へ" kind="secondary" onPress={() => router.replace('/')} />
      </Screen>
    )
  }
  const content = built.value

  async function check() {
    setPhase({ kind: 'working', stage: 'upload' })
    // Coming back from replacing a photo, this screen may still hold the old draft; use the current one.
    const current = latestDraft()
    const fresh = buildContent(current)
    if (!fresh.ok) {
      setPhase({ kind: 'failed', stage: 'upload', message: fresh.issues[0] ?? describeError(null) })
      return
    }
    const result = await uploadAndModerate(
      current,
      fresh.value,
      { api, readPhoto: (ref) => loadPhoto(kv, ref), rememberGift: (giftId) => dispatch({ type: 'serverGift', giftId }) },
      (stage, detail) => setPhase({ kind: 'working', stage, detail }),
    )
    if (result.ok) {
      setPhase({ kind: 'review', giftId: result.giftId })
      return
    }
    if (result.rejected.length > 0) {
      setPhase({ kind: 'rejected', refs: result.rejected, message: '公開できない写真があります。差し替えるまで公開できません。' })
      return
    }
    setPhase({ kind: 'failed', stage: 'moderation', message: describeError(result.error) })
  }

  async function buy(giftId: string, credit?: string) {
    setBuyNote('')
    if (!credit) void api.track('purchase_started', { tier })
    try {
      const published = await purchaseAndPublish(giftId, appStore, api, (stage) => setPhase({ kind: 'working', stage }), { tier, credit, kv })
      const toName = content.share.to.displayName
      await addHistory(kv, {
        giftId,
        shareId: published.shareId,
        url: published.url,
        revokeUrl: published.revokeUrl,
        toName,
        expiresAt: published.expiresAt,
        publishedAt: Date.now(),
      })
      setPublished({ ...published, giftId, toName })
      void refreshCredits()
      router.replace(`/gift/${giftId}`)
      // The published gift lives on the server now; the draft and its photos leave the device.
      dispatch({ type: 'reset' })
      await clearDraft(kv)
    } catch (error) {
      if (error instanceof PurchaseCancelled) {
        void api.track('purchase_cancelled', { tier })
        setBuyNote('購入をキャンセルしました。課金されていません。')
        setPhase({ kind: 'buy', giftId })
        return
      }
      // Whatever happened, a paid transaction is replayed on the next start (F3-03).
      void refreshCredits()
      setPhase({ kind: 'failed', stage: 'purchase', message: describeError(error) })
    }
  }

  return (
    <Screen testID="step-publish">
      <View style={[styles.row, { flexWrap: 'wrap', gap: 6 }]} testID="publish-stages">
        {PUBLISH_STAGES.map((stage, i) => (
          <Text
            key={stage.id}
            style={{
              fontSize: 12,
              paddingHorizontal: 8,
              paddingVertical: 4,
              borderRadius: 10,
              overflow: 'hidden',
              color: i <= currentIndex ? '#fff' : colors.muted,
              backgroundColor: i < currentIndex ? colors.ok : i === currentIndex ? colors.accent : colors.sand,
            }}
          >
            {i + 1}. {stage.label}
          </Text>
        ))}
      </View>

      {phase.kind === 'start' ? (
        <Card>
          <Body>写真と文章をサーバーに送り、公開してよい内容かチェックします。この時点ではまだ誰にも見えません。</Body>
          <Button label="アップロードしてチェック" testID="start-upload" onPress={() => void check()} />
        </Card>
      ) : null}

      {phase.kind === 'working' ? (
        <Card>
          <View style={styles.row}>
            <ActivityIndicator color={colors.accent} />
            <Body>
              {PUBLISH_STAGES.find((stage) => stage.id === phase.stage)?.label}中… {phase.detail ?? ''}
            </Body>
          </View>
        </Card>
      ) : null}

      {phase.kind === 'rejected' ? (
        <Card>
          <Notice tone="error" testID="moderation-rejected">
            {phase.message}
          </Notice>
          <Body>
            {draft.coins
              .map((coin, i) => (phase.refs.includes(coin.photoRef) ? `${i + 1}枚目` : null))
              .filter(Boolean)
              .join('、')}
            の写真を差し替えてください。
          </Body>
          <Button
            label="写真を差し替える"
            testID="fix-photos"
            onPress={() => router.push({ pathname: '/create/coins', params: { rejected: phase.refs.join(',') } })}
          />
          <Button label="差し替えたので、もう一度チェック" kind="secondary" testID="recheck" onPress={() => void check()} />
        </Card>
      ) : null}

      {phase.kind === 'failed' ? (
        <Card>
          <Notice tone="error" testID="publish-error">
            {phase.message}
          </Notice>
          <Button label="もう一度" kind="secondary" onPress={() => setPhase({ kind: 'start' })} />
        </Card>
      ) : null}

      {phase.kind === 'review' ? (
        <>
          <Notice tone="ok" testID="moderation-ok">
            チェックが終わりました。最後にもう一度見てください。
          </Notice>
          <PlayerPreview payload={previewPayload(content, urls)} testID="publish-preview" />
          <Button label="この内容で公開する" testID="confirm-preview" onPress={() => setPhase({ kind: 'buy', giftId: phase.giftId })} />
        </>
      ) : null}

      {phase.kind === 'buy' ? (
        <Card>
          <Body>プランをえらんでください。公開するとリンクができ、期限が来るか失効すると写真もサーバーから消えます。</Body>
          {PRICE_TIERS.map((entry) => {
            const price = products.find((product) => product.tier === entry.id)?.price ?? `¥${entry.priceJpy}`
            return (
              <Choice
                key={entry.id}
                title={`${entry.name}　${price}`}
                detail={entry.blurb}
                selected={tier === entry.id}
                onPress={() => setTier(entry.id)}
                testID={`tier-${entry.id}`}
              />
            )
          })}
          {buyNote ? <Notice tone="warn" testID="buy-note">{buyNote}</Notice> : null}
          {credits.length > 0 ? (
            <Notice tone="ok" testID="credit">
              {`使われていない購入があります（${tierById(credits[0].tier ?? '')?.name ?? '購入済み'}）。これで公開できます。`}
            </Notice>
          ) : null}
          {credits.length > 0 ? (
            <Button label="購入済みの分で公開する" testID="use-credit" onPress={() => void buy(phase.giftId, credits[0].transactionId)} />
          ) : null}
          <Notice tone="warn">{appStore.label}</Notice>
          <Button
            label={`${products.find((product) => product.tier === tier)?.price ?? ''}で購入して公開する`}
            kind={credits.length > 0 ? 'secondary' : 'primary'}
            testID="purchase"
            onPress={() => void buy(phase.giftId)}
          />
          <Body muted>消耗型のアプリ内課金です（ギフト1件ごと）。購入後に通信が切れても、次にアプリを開いたときに自動で公開の手続きを再開します。</Body>
        </Card>
      ) : null}
    </Screen>
  )
}
