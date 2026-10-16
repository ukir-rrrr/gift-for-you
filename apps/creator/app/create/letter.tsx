import { LIMITS } from '@gfy/schema'
import { Body, Field, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { useApp } from '../../src/state/app'

/** F2-05 (letter): up to 500 characters, plus who it is from and for. */
export default function LetterStep() {
  const { draft, dispatch } = useApp()
  return (
    <Screen footer={<StepFooter step="letter" next="/create/egift" />} testID="step-letter">
      <StepHeader step="letter" />
      <Body>ゴールでプレゼントを開けたあとに、手紙が一文字ずつ出てきます。</Body>
      <Field label="だれへ（相手の名前）" value={draft.toName} max={LIMITS.displayName} placeholder="彩" onChange={(toName) => dispatch({ type: 'names', toName })} testID="to-name" />
      <Field label="だれから（あなたの名前）" value={draft.fromName} max={LIMITS.displayName} placeholder="健太" onChange={(fromName) => dispatch({ type: 'names', fromName })} testID="from-name" />
      <Field label="手紙" value={draft.letter} max={LIMITS.letter} multiline placeholder="いつもありがとう。" onChange={(letter) => dispatch({ type: 'letter', letter })} testID="letter" />
      <Body muted>絵文字は表示されません。</Body>
    </Screen>
  )
}
