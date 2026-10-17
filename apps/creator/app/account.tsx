import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { View } from 'react-native'
import { LegalLinks } from '../src/components/LegalLinks'
import { Body, Button, Card, Notice, Screen, Title } from '../src/components/ui'
import { describeError } from '../src/lib/api'
import { wipeLocalData } from '../src/lib/storage'
import { resetDeviceKey } from '../src/native/device'
import { signIn, signInProviders, type SignInProvider } from '../src/native/signin'
import { appStore } from '../src/native/store'
import { useApp } from '../src/state/app'

const PROVIDER_NAME: Record<string, string> = { apple: 'Apple', google: 'Google', mock: 'テスト用アカウント' }

/**
 * F3-12: what the app keeps, the optional sign-in link (history follows the person to a new phone),
 * and in-app account deletion: every gift, the history, the device key, and the sign-in link.
 */
export default function Account() {
  const router = useRouter()
  const { api, kv, dispatch, setPublished } = useApp()
  const [linked, setLinked] = useState<string[] | null>(null)
  const [providers, setProviders] = useState<SignInProvider[]>([])
  const [message, setMessage] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [deleted, setDeleted] = useState(false)

  useFocusEffect(
    useCallback(() => {
      let alive = true
      void signInProviders().then((list) => alive && setProviders(list))
      void api
        .account()
        .then((account) => alive && setLinked(account.linked))
        .catch(() => alive && setLinked([]))
      return () => {
        alive = false
      }
    }, [api]),
  )

  async function link(provider: SignInProvider) {
    setMessage('')
    try {
      const token = await signIn(provider)
      if (!token) return
      await api.linkAccount(token.provider, token.idToken)
      setLinked((await api.account()).linked)
      setMessage('連携しました。ほかの端末で同じアカウントを連携すると、作成履歴がそちらにも出ます。')
    } catch (error) {
      setMessage(describeError(error))
    }
  }

  async function remove() {
    setMessage('')
    try {
      await api.deleteAccount()
      await wipeLocalData(kv)
      await appStore.reset?.()
      await resetDeviceKey()
      dispatch({ type: 'reset' })
      setPublished(null)
      setDeleted(true)
      setConfirm(false)
    } catch (error) {
      setMessage(describeError(error))
    }
  }

  if (deleted) {
    return (
      <Screen testID="account-screen">
        <Notice tone="ok" testID="account-deleted">
          アカウントを削除しました。公開中のギフトは開けなくなり、写真・作成履歴・端末キー・サインイン連携もすべて消えました。
        </Notice>
        <Button label="最初の画面へ" onPress={() => router.replace('/')} />
      </Screen>
    )
  }

  return (
    <Screen testID="account-screen">
      <Title>アカウントとデータ</Title>
      <Card>
        <Body>
          このアプリは登録なしで使えます。端末ごとに匿名の「端末キー」を作り、サーバーにはそのハッシュだけを保存しています。
        </Body>
        <Body muted>この端末に保存しているもの：作りかけの下書きと写真、作成履歴、端末キー</Body>
      </Card>

      <Card>
        <Body>サインイン連携（任意）</Body>
        <Body muted testID="linked">
          {linked === null ? '確認中…' : linked.length > 0 ? `連携中：${linked.map((p) => PROVIDER_NAME[p] ?? p).join('、')}` : 'まだ連携していません'}
        </Body>
        {providers.map((provider) => (
          <Button
            key={provider}
            label={`${PROVIDER_NAME[provider]}でサインインして連携`}
            kind="secondary"
            testID={`link-${provider}`}
            onPress={() => void link(provider)}
          />
        ))}
        {providers.length === 0 ? <Body muted>このビルドでは連携できるサインインがありません。</Body> : null}
      </Card>

      {message ? <Notice testID="account-message">{message}</Notice> : null}

      <Card>
        <Body>アカウントを削除</Body>
        <Body muted>
          公開中のギフトはすべて開けなくなり、写真と文章はサーバーから消えます。作成履歴、端末キー、サインイン連携も削除します。まだ使っていない購入分も使えなくなります。元にはもどせません。
        </Body>
        {confirm ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button label="やめる" kind="secondary" onPress={() => setConfirm(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <Button label="削除する" kind="danger" testID="confirm-delete-account" onPress={() => void remove()} />
            </View>
          </View>
        ) : (
          <Button label="アカウントを削除" kind="danger" testID="delete-account" onPress={() => setConfirm(true)} />
        )}
      </Card>
      <LegalLinks />
    </Screen>
  )
}
