import { useRouter } from 'expo-router'
import { useEffect, useMemo } from 'react'
import { View } from 'react-native'
import { PlayerPreview } from '../../src/components/PlayerPreview'
import { Body, Button, Notice, Screen } from '../../src/components/ui'
import { buildContent, previewPayload } from '../../src/lib/share'
import { usePhotoUrls, useApp } from '../../src/state/app'

/** F2-06: the real player bundle with the local draft; e-gift is a dummy and nothing is sent. */
export default function PreviewStep() {
  const router = useRouter()
  const { draft, api } = useApp()
  const built = useMemo(() => buildContent(draft), [draft])
  useEffect(() => {
    void api.track('preview_opened')
  }, [api])
  const urls = usePhotoUrls(draft.coins.map((coin) => coin.photoRef))
  const ready = draft.coins.every((coin) => urls[coin.photoRef])

  if (!built.ok) {
    return (
      <Screen testID="step-preview">
        <Notice tone="error">まだ足りないところがあります。</Notice>
        {built.issues.map((issue) => (
          <Body key={issue}>・{issue}</Body>
        ))}
        <Button label="最初の画面へ" kind="secondary" onPress={() => router.replace('/')} />
      </Screen>
    )
  }
  return (
    <Screen
      testID="step-preview"
      footer={
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Button label="なおす" kind="secondary" onPress={() => router.back()} />
          </View>
          <View style={{ flex: 2 }}>
            <Button label="公開へすすむ" testID="to-publish" onPress={() => router.push('/create/publish')} />
          </View>
        </View>
      }
    >
      <Body>相手が見るのと同じ画面です。プレビューでは通知もeギフトのリンクも動きません。</Body>
      {ready ? <PlayerPreview payload={previewPayload(built.value, urls)} testID="player-preview" /> : <Body muted>写真を読み込み中…</Body>}
    </Screen>
  )
}
