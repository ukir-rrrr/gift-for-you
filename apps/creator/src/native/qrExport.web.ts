import type { ComponentRef, RefObject } from 'react'
import type { View } from 'react-native'
import { expiresLabel, qrCardSvg } from '../lib/qr'

export type CardInfo = { url: string; toName: string; expiresAt: string }

/** F2-12 on the web: draws the card SVG onto a canvas and downloads a PNG. */
export async function exportQrCard(info: CardInfo, _card: RefObject<ComponentRef<typeof View> | null>): Promise<'shared' | 'unavailable'> {
  const svg = qrCardSvg({ url: info.url, toName: info.toName, expiresLabel: expiresLabel(info.expiresAt) })
  const image = new Image()
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve()
    image.onerror = () => reject(new Error('svg'))
  })
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  await loaded
  const canvas = document.createElement('canvas')
  canvas.width = image.width || 600
  canvas.height = image.height || 820
  const context = canvas.getContext('2d')
  if (!context) return 'unavailable'
  context.drawImage(image, 0, 0)
  const link = document.createElement('a')
  link.href = canvas.toDataURL('image/png')
  link.download = 'gift-qr-card.png'
  link.click()
  return 'shared'
}
