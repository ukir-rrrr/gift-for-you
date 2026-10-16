import { GIFT_ITEMS } from '@gfy/catalog'
import { LIMITS } from '@gfy/schema'
import { Image } from 'react-native'
import { Body, Choice, Field, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { API_ORIGIN } from '../../src/native/config'
import { useApp } from '../../src/state/app'

/** F2-04: every catalog item, plus the name shown at the goal. */
export default function ItemStep() {
  const { draft, dispatch } = useApp()
  return (
    <Screen footer={<StepFooter step="item" next="/create/letter" />} testID="step-item">
      <StepHeader step="item" />
      <Body>ゴールの箱から出てくるプレゼントです。</Body>
      {GIFT_ITEMS.map((item) => (
        <Choice
          key={item.id}
          title={item.name}
          selected={draft.itemId === item.id}
          onPress={() => dispatch({ type: 'item', itemId: item.id })}
          testID={`item-${item.id}`}
          aside={
            <Image
              source={{ uri: `${API_ORIGIN}/assets/items/${item.id}.png` }}
              style={{ width: 40, height: 40 }}
              resizeMode="contain"
              accessibilityIgnoresInvertColors
            />
          }
        />
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
