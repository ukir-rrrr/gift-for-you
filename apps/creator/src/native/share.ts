import * as Clipboard from 'expo-clipboard'
import { Share } from 'react-native'

export function shareMessage(toName: string, url: string): string {
  return `${toName}へ ちょっとした冒険を用意しました。\n${url}`
}

/** Opens the OS share sheet. Where there is none (desktop web), copies the link instead. */
export async function shareLink(toName: string, url: string): Promise<'shared' | 'copied' | 'dismissed'> {
  try {
    const result = await Share.share({ message: shareMessage(toName, url), url, title: 'gift-for-you' })
    return result.action === Share.dismissedAction ? 'dismissed' : 'shared'
  } catch {
    await Clipboard.setStringAsync(url)
    return 'copied'
  }
}

export async function copyText(text: string): Promise<void> {
  await Clipboard.setStringAsync(text)
}
