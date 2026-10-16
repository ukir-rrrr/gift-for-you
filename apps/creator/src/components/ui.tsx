import { textLength } from '@gfy/schema'
import { useRouter } from 'expo-router'
import type { ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { STEPS, stepIssues, type Step } from '../lib/draft'
import { useApp } from '../state/app'

export const colors = {
  paper: '#f4ecdf',
  card: '#fffaf2',
  sand: '#d8c9b0',
  ink: '#1a1614',
  muted: '#6b5f55',
  accent: '#6b3030',
  blue: '#4a6580',
  ok: '#3d6b3a',
  warn: '#8a5a12',
  line: '#c9b89c',
}

export function Screen({ children, footer, testID }: { children: ReactNode; footer?: ReactNode; testID?: string }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom }]} testID={testID}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </View>
  )
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  )
}

export function Body({ children, muted, style, testID }: { children: ReactNode; muted?: boolean; style?: object; testID?: string }) {
  return (
    <Text style={[styles.body, muted && { color: colors.muted }, style]} testID={testID}>
      {children}
    </Text>
  )
}

type ButtonProps = {
  label: string
  onPress: () => void
  kind?: 'primary' | 'secondary' | 'danger' | 'plain'
  disabled?: boolean
  testID?: string
  small?: boolean
  accessibilityLabel?: string
}

export function Button({ label, onPress, kind = 'primary', disabled, testID, small, accessibilityLabel }: ButtonProps) {
  const palette = {
    primary: { backgroundColor: colors.accent, color: '#fff' },
    secondary: { backgroundColor: colors.card, color: colors.ink },
    danger: { backgroundColor: '#fff', color: colors.accent },
    plain: { backgroundColor: 'transparent', color: colors.blue },
  }[kind]
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={({ pressed }) => [
        styles.button,
        small && styles.buttonSmall,
        { backgroundColor: palette.backgroundColor },
        kind !== 'primary' && kind !== 'plain' && styles.buttonOutline,
        kind === 'danger' && { borderColor: colors.accent },
        disabled && styles.disabled,
        pressed && { opacity: 0.75 },
      ]}
    >
      <Text style={[styles.buttonText, small && styles.buttonTextSmall, { color: palette.color }]}>{label}</Text>
    </Pressable>
  )
}

type FieldProps = Omit<TextInputProps, 'onChangeText' | 'onChange' | 'value'> & {
  label: string
  value: string
  onChange: (value: string) => void
  max?: number
  testID?: string
}

export function Field({ label, value, onChange, max, testID, multiline, ...rest }: FieldProps) {
  const count = textLength(value)
  return (
    <View style={styles.field}>
      <View style={styles.fieldHead}>
        <Text style={styles.label}>{label}</Text>
        {max ? (
          <Text style={[styles.counter, count >= max && { color: colors.accent }]} testID={testID ? `${testID}-count` : undefined}>
            {count}/{max}
          </Text>
        ) : null}
      </View>
      <TextInput
        {...rest}
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        style={[styles.input, multiline && styles.inputMulti]}
        placeholderTextColor={colors.muted}
        testID={testID}
      />
    </View>
  )
}

export function Choice({
  title,
  detail,
  selected,
  onPress,
  testID,
  aside,
}: {
  title: string
  detail?: string
  selected: boolean
  onPress: () => void
  testID?: string
  aside?: ReactNode
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={title}
      onPress={onPress}
      testID={testID}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      {aside}
      <View style={{ flex: 1 }}>
        <Text style={styles.choiceTitle}>{title}</Text>
        {detail ? <Text style={styles.choiceDetail}>{detail}</Text> : null}
      </View>
      <Text style={[styles.check, selected && { color: colors.accent }]}>{selected ? '●' : '○'}</Text>
    </Pressable>
  )
}

export function Notice({ tone = 'info', children, testID }: { tone?: 'info' | 'warn' | 'error' | 'ok'; children: ReactNode; testID?: string }) {
  const tint = { info: colors.blue, warn: colors.warn, error: colors.accent, ok: colors.ok }[tone]
  return (
    <View style={[styles.notice, { borderColor: tint }]} testID={testID} accessibilityRole={tone === 'error' ? 'alert' : undefined}>
      {typeof children === 'string' ? <Text style={[styles.body, { color: tint }]}>{children}</Text> : children}
    </View>
  )
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>
}

/** Progress dots plus a "saved on this device" hint for the create flow. */
export function StepHeader({ step }: { step: Step }) {
  const { saving } = useApp()
  const index = STEPS.findIndex((entry) => entry.id === step)
  return (
    <View style={styles.stepHeader}>
      <Text style={styles.stepCount}>
        {index + 1} / {STEPS.length}　{STEPS[index].title}
      </Text>
      <View style={styles.dots}>
        {STEPS.map((entry, i) => (
          <View key={entry.id} style={[styles.dot, i <= index && { backgroundColor: colors.accent }]} />
        ))}
      </View>
      <Text style={styles.saved} testID="autosave">
        {saving ? '保存中…' : 'この端末に自動保存'}
      </Text>
    </View>
  )
}

/** Back / next for a create step; next stays disabled while the step has issues, and says why. */
export function StepFooter({ step, next }: { step: Step; next: string }) {
  const router = useRouter()
  const { draft } = useApp()
  const issues = stepIssues(draft, step)
  return (
    <View style={{ gap: 8 }}>
      {issues.length > 0 ? (
        <Text style={styles.issue} testID="step-issues">
          {issues[0]}
        </Text>
      ) : null}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Button label="もどる" kind="secondary" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        </View>
        <View style={{ flex: 2 }}>
          <Button label="つぎへ" testID="next" disabled={issues.length > 0} onPress={() => router.push(next as never)} />
        </View>
      </View>
    </View>
  )
}

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.paper },
  content: { padding: 16, gap: 14, maxWidth: 560, width: '100%', alignSelf: 'center' },
  footer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.paper,
    maxWidth: 560,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  button: { minHeight: 48, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonSmall: { minHeight: 36, paddingHorizontal: 10 },
  buttonOutline: { borderWidth: 1, borderColor: colors.line },
  buttonText: { fontSize: 16, fontWeight: '700' },
  buttonTextSmall: { fontSize: 13 },
  disabled: { opacity: 0.4 },
  field: { gap: 6 },
  fieldHead: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 14, fontWeight: '700', color: colors.ink },
  counter: { fontSize: 13, color: colors.muted },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 8,
    backgroundColor: colors.card,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.ink,
  },
  inputMulti: { minHeight: 180, textAlignVertical: 'top' },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.line,
    backgroundColor: colors.card,
  },
  choiceSelected: { borderColor: colors.accent },
  choiceTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  choiceDetail: { fontSize: 13, color: colors.muted, marginTop: 2 },
  check: { fontSize: 18, color: colors.line },
  notice: { borderLeftWidth: 4, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: colors.card, borderRadius: 6 },
  card: { backgroundColor: colors.card, borderRadius: 12, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  stepHeader: { gap: 6 },
  stepCount: { fontSize: 13, color: colors.muted, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 6 },
  dot: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.line },
  saved: { fontSize: 12, color: colors.muted },
  issue: { color: colors.accent, fontSize: 13 },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center' },
})
