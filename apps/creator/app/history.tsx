import { useFocusEffect, useRouter } from 'expo-router'
import { useCallback, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Body, Card, colors, Notice, Screen } from '../src/components/ui'
import { describeError, type RemoteGift } from '../src/lib/api'
import { expiresLabel } from '../src/lib/qr'
import { loadHistory, type LocalGift } from '../src/lib/storage'
import { useApp } from '../src/state/app'

type Row = { giftId: string; toName: string; status: string; expiresAt: string | null; opened: boolean; goal: boolean }

const STATUS: Record<string, string> = { published: '公開中', revoked: '失効', expired: '期限切れ', unknown: '確認できません' }

export function mergeHistory(local: LocalGift[], remote: RemoteGift[] | null): Row[] {
  const rows = new Map<string, Row>()
  for (const gift of local) {
    rows.set(gift.giftId, { giftId: gift.giftId, toName: gift.toName, status: remote ? 'unknown' : 'published', expiresAt: gift.expiresAt, opened: false, goal: false })
  }
  for (const gift of remote ?? []) {
    const known = rows.get(gift.giftId)
    rows.set(gift.giftId, {
      giftId: gift.giftId,
      toName: gift.toName ?? known?.toName ?? '',
      status: gift.status,
      expiresAt: gift.expiresAt ? new Date(gift.expiresAt).toISOString() : (known?.expiresAt ?? null),
      opened: gift.openedAt !== null,
      goal: gift.goalAt !== null,
    })
  }
  return [...rows.values()]
}

/** F2-11: gifts made on this device (anonymous device key), with their state on the server. */
export default function History() {
  const router = useRouter()
  const { api, kv } = useApp()
  const [rows, setRows] = useState<Row[] | null>(null)
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
              <Text style={{ color: row.status === 'published' ? colors.ok : colors.muted }}>{STATUS[row.status] ?? row.status}</Text>
            </View>
            <Body muted>
              {row.expiresAt ? expiresLabel(row.expiresAt) : ''}
              {row.opened ? '・開封済み' : ''}
              {row.goal ? '・ゴール' : ''}
            </Body>
          </Card>
        </Pressable>
      ))}
    </Screen>
  )
}
