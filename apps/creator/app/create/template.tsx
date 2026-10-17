import { TEMPLATES, type ThemeId } from '@gfy/catalog'
import { Body, Choice, Screen, StepFooter, StepHeader } from '../../src/components/ui'
import { useApp } from '../../src/state/app'

const THEME_NAME: Record<ThemeId, string> = { meadow: '昼の草原', seaside: '夕方の海', night: '夜の森' }

/** F2-01 / F3-01: three courses, each about two minutes in three sections. */
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
          detail={`${THEME_NAME[template.theme]}・約2分・思い出コイン${template.coinSlots}枚まで\n${template.blurb}`}
          selected={draft.templateId === template.id}
          onPress={() => dispatch({ type: 'template', templateId: template.id })}
          testID={`template-${template.id}`}
        />
      ))}
    </Screen>
  )
}
