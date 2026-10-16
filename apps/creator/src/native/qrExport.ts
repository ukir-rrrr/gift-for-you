import * as Sharing from 'expo-sharing'
import type { ComponentRef, RefObject } from 'react'
import type { View } from 'react-native'
import { captureRef } from 'react-native-view-shot'

export type CardInfo = { url: string; toName: string; expiresAt: string }

/** F2-12: renders the on-screen QR card to a PNG and opens the share sheet with it. */
export async function exportQrCard(_info: CardInfo, card: RefObject<ComponentRef<typeof View> | null>): Promise<'shared' | 'unavailable'> {
  if (!card.current || !(await Sharing.isAvailableAsync())) return 'unavailable'
  const uri = await captureRef(card, { format: 'png', quality: 1, result: 'tmpfile' })
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'QRカード' })
  return 'shared'
}
