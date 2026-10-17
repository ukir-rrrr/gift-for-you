import { useRouter } from 'expo-router'
import { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { Body, Button, Card, Screen, Title } from '../src/components/ui'
import { LegalLinks } from '../src/components/LegalLinks'
import { isStarted, STEPS, stepIssues } from '../src/lib/draft'
import { clearDraft } from '../src/lib/storage'
import { useApp } from '../src/state/app'

export default function Home() {
  const router = useRouter()
  const { draft, dispatch, loaded, kv, api } = useApp()
  const [confirmNew, setConfirmNew] = useState(false)
  if (!loaded) {
    return (
      <Screen>
        <ActivityIndicator />
      </Screen>
    )
  }
  const started = isStarted(draft)
  const resumeAt = STEPS.find((step) => stepIssues(draft, step.id).length > 0)?.id ?? 'preview'

  const startNew = async () => {
    await clearDraft(kv)
    dispatch({ type: 'reset' })
    setConfirmNew(false)
    void api.track('create_started')
    router.push('/create/template')
  }

  return (
    <Screen testID="home">
      <Title>小さな冒険のギフトをつくる</Title>
      <Body muted>
        思い出の写真をコインにして、相手が歩いて集める約2分のゲームを贈れます。リンクは14日間（ロングは30日間）ひらけます。
      </Body>
      {started ? (
        <Card>
          <Body>つくりかけの下書きがあります{draft.toName ? `（${draft.toName}へ）` : ''}。</Body>
          <Button label="続きからつくる" testID="resume" onPress={() => router.push(`/create/${resumeAt}`)} />
        </Card>
      ) : null}
      {started && confirmNew ? (
        <Card>
          <Body>今の下書きは消えます。よろしいですか？</Body>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="やめる" kind="secondary" onPress={() => setConfirmNew(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="消して新しく" kind="danger" testID="confirm-new" onPress={() => void startNew()} />
            </View>
          </View>
        </Card>
      ) : (
        <Button
          label="新しくつくる"
          kind={started ? 'secondary' : 'primary'}
          testID="create"
          onPress={() => (started ? setConfirmNew(true) : void startNew())}
        />
      )}
      <Button label="作成履歴" kind="plain" testID="history" onPress={() => router.push('/history')} />
      <Button label="アカウントとデータ" kind="plain" testID="account" onPress={() => router.push('/account')} />
      <LegalLinks />
    </Screen>
  )
}
