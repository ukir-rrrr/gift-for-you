import { createElement, useEffect, useRef } from 'react'
import { StyleSheet, View } from 'react-native'
import type { PreviewPayload } from '../lib/share'
import { API_ORIGIN } from '../native/config'

/**
 * F2-06 on the web: the same player bundle in an iframe. The player asks its parent for the payload
 * and the parent answers only that frame, only at the player's origin. The sandbox has no popups or
 * top navigation, so the e-gift stays a dummy here too.
 */
export function PlayerPreview({ payload, testID }: { payload: PreviewPayload; testID?: string }) {
  const frame = useRef<HTMLIFrameElement | null>(null)
  const latest = useRef(payload)
  latest.current = payload

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== API_ORIGIN || event.source !== frame.current?.contentWindow) return
      if ((event.data as { type?: unknown } | null)?.type !== 'gfy-preview-ready') return
      frame.current?.contentWindow?.postMessage({ type: 'gfy-preview', payload: latest.current }, API_ORIGIN)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  return (
    <View style={styles.frame} testID={testID}>
      {createElement('iframe', {
        ref: frame,
        src: `${API_ORIGIN}/preview`,
        title: 'プレビュー',
        sandbox: 'allow-scripts allow-same-origin',
        referrerPolicy: 'no-referrer',
        'data-testid': 'player-frame',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 9 / 16, maxHeight: 700, borderRadius: 12, overflow: 'hidden', backgroundColor: '#1a1614' },
})
