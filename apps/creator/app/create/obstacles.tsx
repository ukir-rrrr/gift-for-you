import { DIFFICULTIES } from '@gfy/catalog'
import { Body, Choice, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { useApp } from '../../src/state/app'

/** F2-02: the three obstacle presets. */
export default function ObstaclesStep() {
  const { draft, dispatch } = useApp()
  return (
    <Screen footer={<StepFooter step="obstacles" next="/create/coins" />} testID="step-obstacles">
      <StepHeader step="obstacles" />
      <Body>相手に合わせて障害物の多さをえらべます。プレイ中に「お助け」も出ます。</Body>
      {DIFFICULTIES.map((difficulty) => (
        <Choice
          key={difficulty.id}
          title={difficulty.name}
          detail={difficulty.blurb}
          selected={draft.difficulty === difficulty.id}
          onPress={() => dispatch({ type: 'difficulty', difficulty: difficulty.id })}
          testID={`difficulty-${difficulty.id}`}
        />
      ))}
    </Screen>
  )
}
