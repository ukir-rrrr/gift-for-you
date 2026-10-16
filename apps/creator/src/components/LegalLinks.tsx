import { Linking, Platform, Text, View } from 'react-native'
import { LEGAL_URLS } from '../native/config'
import { colors } from './ui'

const LINKS: { key: keyof typeof LEGAL_URLS; label: string }[] = [
  { key: 'terms', label: '利用規約' },
  { key: 'privacy', label: 'プライバシーポリシー' },
  { key: 'tokushoho', label: '特定商取引法に基づく表記' },
  { key: 'support', label: 'お問い合わせ・サポート' },
]

/** F3-05 / F3-12: terms, privacy, 特商法, and support, one tap from home and the account screen. */
export function LegalLinks() {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }} testID="legal-links">
      {LINKS.map((link) => (
        <Text
          key={link.key}
          accessibilityRole="link"
          style={{ color: colors.blue, textDecorationLine: 'underline', fontSize: 13 }}
          // Web gets a real link so it opens in a new tab; native hands it to the browser.
          {...(Platform.OS === 'web' ? { href: LEGAL_URLS[link.key], hrefAttrs: { target: '_blank', rel: 'noopener' } } : {})}
          onPress={Platform.OS === 'web' ? undefined : () => void Linking.openURL(LEGAL_URLS[link.key])}
          testID={`legal-${link.key}`}
        >
          {link.label}
        </Text>
      ))}
    </View>
  )
}
