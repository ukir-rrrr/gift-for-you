import { LIMITS } from '@gfy/schema'
import * as Crypto from 'expo-crypto'
import { useLocalSearchParams } from 'expo-router'
import { useEffect, useState } from 'react'
import { Text, View } from 'react-native'
import { Photo } from '../../src/components/Photo'
import { Body, Button, Card, colors, Field, Notice, Screen, StepFooter, StepHeader, styles } from '../../src/components/ui'
import { coinLimit, newPhotoRef } from '../../src/lib/draft'
import { prunePhotos, savePhoto } from '../../src/lib/storage'
import { pickPhoto } from '../../src/native/photos'
import { usePhotoUrls, useApp } from '../../src/state/app'

const PICK_ERRORS = {
  denied: '写真へのアクセスが許可されていません。設定から許可してください',
  unreadable: 'この写真は読み込めませんでした。別の写真をえらんでください',
} as const

/** F2-03: photo -> resized and stripped on the device -> a line of text -> order. */
export default function CoinsStep() {
  const { draft, dispatch, kv, loaded } = useApp()
  const params = useLocalSearchParams<{ rejected?: string }>()
  const rejected = new Set((params.rejected ?? '').split(',').filter(Boolean))
  const refs = draft.coins.map((coin) => coin.photoRef)
  const urls = usePhotoUrls(refs)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const limit = coinLimit(draft)

  // Photos that no coin uses any more leave the device storage too. Never before the saved draft
  // is loaded: until then the coin list is empty and every stored photo would look unused.
  const refKey = refs.join('|')
  useEffect(() => {
    if (loaded) void prunePhotos(kv, refKey ? refKey.split('|') : [])
  }, [kv, refKey, loaded])

  async function pick(replaceIndex?: number) {
    setBusy(true)
    setError('')
    try {
      const result = await pickPhoto()
      if (!result.ok) {
        if (result.reason !== 'cancelled') setError(PICK_ERRORS[result.reason])
        return
      }
      const ref = newPhotoRef(() => Crypto.randomUUID())
      await savePhoto(kv, ref, result.photo.bytes)
      const { width, height } = result.photo
      if (replaceIndex === undefined) dispatch({ type: 'addCoin', coin: { photoRef: ref, width, height, message: '' } })
      else dispatch({ type: 'replacePhoto', index: replaceIndex, photoRef: ref, width, height })
    } catch {
      setError(PICK_ERRORS.unreadable)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Screen footer={<StepFooter step="coins" next="/create/item" />} testID="step-coins">
      <StepHeader step="coins" />
      <Body>
        コースに置く思い出の写真と一言です（{limit}枚まで）。写真はこの端末で長い辺1080pxまで縮小し、位置情報などを消してから使います。
      </Body>
      {rejected.size > 0 ? <Notice tone="error">公開できない写真があります。赤い枠の写真を差し替えてください。</Notice> : null}
      {draft.coins.map((coin, index) => (
        <Card key={coin.photoRef} style={rejected.has(coin.photoRef) ? { borderColor: colors.accent, borderWidth: 2 } : undefined}>
          <View style={styles.row}>
            <Text style={{ fontSize: 20, fontWeight: '700', width: 28, color: colors.accent }}>{index + 1}</Text>
            <Photo uri={urls[coin.photoRef]} testID={`coin-photo-${index}`} />
            <View style={{ flex: 1, gap: 6 }}>
              <View style={[styles.row, { gap: 6, flexWrap: 'wrap' }]}>
                <Button small kind="secondary" label="↑" accessibilityLabel={`${index + 1}枚目を前へ`} disabled={index === 0} testID={`coin-up-${index}`} onPress={() => dispatch({ type: 'moveCoin', from: index, to: index - 1 })} />
                <Button small kind="secondary" label="↓" accessibilityLabel={`${index + 1}枚目を後ろへ`} disabled={index === draft.coins.length - 1} testID={`coin-down-${index}`} onPress={() => dispatch({ type: 'moveCoin', from: index, to: index + 1 })} />
                <Button small kind="secondary" label="差し替え" testID={`coin-replace-${index}`} disabled={busy} onPress={() => void pick(index)} />
                <Button small kind="danger" label="削除" testID={`coin-remove-${index}`} onPress={() => dispatch({ type: 'removeCoin', index })} />
              </View>
            </View>
          </View>
          <Field
            label="ひとこと"
            value={coin.message}
            max={LIMITS.coinMessage}
            placeholder="はじめて並んで歩いた日"
            onChange={(message) => dispatch({ type: 'coinMessage', index, message })}
            testID={`coin-message-${index}`}
          />
        </Card>
      ))}
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button
        label={busy ? '読み込み中…' : `写真を追加（${draft.coins.length}/${limit}）`}
        kind="secondary"
        testID="add-photo"
        disabled={busy || draft.coins.length >= limit}
        onPress={() => void pick()}
      />
    </Screen>
  )
}
