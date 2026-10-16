import { TEMPLATES } from '@gfy/catalog'
import { Body, Choice, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { useApp } from '../../src/state/app'

/** F2-01 */
export default function TemplateStep() {
  const { draft, dispatch } = useApp()
  return (
    <Screen footer={<StepFooter step="template" next="/create/obstacles" />} testID="step-template">
      <StepHeader step="template" />
      <Body>相手が歩くコースをえらんでください。</Body>
      {TEMPLATES.map((template) => (
        <Choice
          key={template.id}
          title={template.name}
          detail={`${template.blurb}・思い出コイン${template.coinSlots}枚まで`}
          selected={draft.templateId === template.id}
          onPress={() => dispatch({ type: 'template', templateId: template.id })}
          testID={`template-${template.id}`}
        />
      ))}
    </Screen>
  )
}
