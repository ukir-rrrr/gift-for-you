import { GIFT_CATEGORIES, GIFT_ITEMS } from '@gfy/catalog'
import { LIMITS } from '@gfy/schema'
import { Image, Pressable, Text, View } from 'react-native'
import { Body, colors, Field, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { API_ORIGIN } from '../../src/native/config'
import { useApp } from '../../src/state/app'

/** F2-04 / F3-02: every catalog item (about twenty, by category), plus the name shown at the goal. */
export default function ItemStep() {
  const { draft, dispatch } = useApp()
  return (
    <Screen footer={<StepFooter step="item" next="/create/letter" />} testID="step-item">
      <StepHeader step="item" />
      <Body>ゴールの箱から出てくるプレゼントです。</Body>
      {GIFT_CATEGORIES.map((category) => (
        <View key={category.id} style={{ gap: 8 }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.muted }}>{category.name}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {GIFT_ITEMS.filter((item) => item.category === category.id).map((item) => {
              const selected = draft.itemId === item.id
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={item.name}
                  onPress={() => dispatch({ type: 'item', itemId: item.id })}
                  testID={`item-${item.id}`}
                  style={{
                    width: 96,
                    alignItems: 'center',
                    gap: 4,
                    paddingVertical: 10,
                    paddingHorizontal: 4,
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: selected ? colors.accent : colors.line,
                    backgroundColor: colors.card,
                  }}
                >
                  <Image
                    source={{ uri: `${API_ORIGIN}/assets/items/${item.id}.png` }}
                    style={{ width: 48, height: 48 }}
                    resizeMode="contain"
                    accessibilityIgnoresInvertColors
                  />
                  <Text style={{ fontSize: 12, color: colors.ink, textAlign: 'center' }} numberOfLines={2}>
                    {item.name}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>
      ))}
      <Field
        label="プレゼントの名前"
        value={draft.itemLabel}
        max={LIMITS.giftLabel}
        placeholder="ずっと欲しかったマフラー"
        onChange={(label) => dispatch({ type: 'itemLabel', label })}
        testID="item-label"
      />
    </Screen>
  )
}
