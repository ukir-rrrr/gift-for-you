import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Body, Card, colors, Notice, Screen } from '../src/components/ui'
import { describeError, type RemoteGift } from '../src/lib/api'
import { HISTORY_STATUS, mergeHistory, type HistoryRow } from '../src/lib/history'
import { expiresLabel } from '../src/lib/qr'
import { loadHistory } from '../src/lib/storage'
import { THANKS_STAMPS } from '@gfy/schema'
import { useApp } from '../src/state/app'

/** F2-11: gifts made on this device (anonymous device key), with their state on the server. */
export default function History() {
  const router = useRouter()
  const { api, kv } = useApp()
  const [rows, setRows] = useState<HistoryRow[] | null>(null)
  const [error, setError] = useState('')

  useFocusEffect(
    useCallback(() => {
      let alive = true
      void (async () => {
        const local = await loadHistory(kv)
        let remote: RemoteGift[] | null = null
        try {
          remote = await api.listGifts()
          setError('')
        } catch (e) {
          setError(describeError(e))
        }
        if (alive) setRows(mergeHistory(local, remote))
      })()
      return () => {
        alive = false
      }
    }, [api, kv]),
  )

  return (
    <Screen testID="history-screen">
      {error ? <Notice tone="warn">{error}</Notice> : null}
      {rows && rows.length === 0 ? <Body muted>まだ公開したギフトはありません。</Body> : null}
      {rows?.map((row) => (
        <Pressable key={row.giftId} onPress={() => router.push(`/gift/${row.giftId}`)} accessibilityRole="link" testID={`history-${row.giftId}`}>
          <Card>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 17, fontWeight: '700', color: colors.ink }}>{row.toName}へ</Text>
              <Text style={{ color: row.status === 'published' ? colors.ok : colors.muted }}>{HISTORY_STATUS[row.status]}</Text>
            </View>
            <Body muted>
              {row.expiresAt ? expiresLabel(row.expiresAt) : ''}
              {row.opened ? '・開封済み' : ''}
              {row.goal ? '・ゴール' : ''}
            </Body>
            {row.thanks ? (
              <Body testID={`thanks-${row.giftId}`}>{`お返事：「${THANKS_STAMPS.find((stamp) => stamp.id === row.thanks)?.label ?? ''}」`}</Body>
            ) : null}
            {row.status === 'hidden' ? <Body muted>通報などで確認中のため、いまは開けません。</Body> : null}
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
