import { StyleSheet, View } from 'react-native'
import { WebView } from 'react-native-webview'
import { previewInjection, type PreviewPayload } from '../lib/share'
import { API_ORIGIN } from '../native/config'

/**
 * F2-06: the published player bundle, loaded from the gift server, playing the local draft.
 * The payload is injected before the page's scripts run, and the WebView refuses to leave the
 * player's origin, so the dummy e-gift can never navigate anywhere.
 */
export function PlayerPreview({ payload, testID }: { payload: PreviewPayload; testID?: string }) {
  return (
    <View style={styles.frame} testID={testID}>
      <WebView
        source={{ uri: `${API_ORIGIN}/preview` }}
        injectedJavaScriptBeforeContentLoaded={previewInjection(payload)}
        originWhitelist={[API_ORIGIN]}
        onShouldStartLoadWithRequest={(request) => request.url.startsWith(`${API_ORIGIN}/`)}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction
        incognito
        style={styles.web}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 9 / 16, maxHeight: 640, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1614' },
  web: { flex: 1, backgroundColor: '#1a1614' },
})
