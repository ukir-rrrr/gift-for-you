import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { colors } from '../src/components/ui'
import { AppProvider } from '../src/state/app'

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.paper },
            headerTintColor: colors.ink,
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.paper },
            headerBackTitle: 'もどる',
          }}
        >
          <Stack.Screen name="index" options={{ title: 'gift-for-you' }} />
          <Stack.Screen name="create/template" options={{ title: 'コースをえらぶ' }} />
          <Stack.Screen name="create/obstacles" options={{ title: 'むずかしさ' }} />
          <Stack.Screen name="create/coins" options={{ title: '思い出コイン' }} />
          <Stack.Screen name="create/item" options={{ title: 'プレゼント' }} />
          <Stack.Screen name="create/letter" options={{ title: '手紙' }} />
          <Stack.Screen name="create/egift" options={{ title: 'eギフト' }} />
          <Stack.Screen name="create/preview" options={{ title: 'プレビュー' }} />
          <Stack.Screen name="create/publish" options={{ title: '公開' }} />
          <Stack.Screen name="gift/[giftId]" options={{ title: 'ギフト' }} />
          <Stack.Screen name="history" options={{ title: '作成履歴' }} />
        </Stack>
      </AppProvider>
    </SafeAreaProvider>
  )
}
