import { create } from 'qrcode'

export type QrMatrix = { size: number; dark(row: number, col: number): boolean }

export function qrMatrix(text: string): QrMatrix {
  const { modules } = create(text, { errorCorrectionLevel: 'M' })
  return { size: modules.size, dark: (row, col) => Boolean(modules.get(row, col)) }
}

/** One SVG path for all dark modules, in module units, with a 4-module quiet zone. */
export function qrPath(text: string): { path: string; size: number } {
  const matrix = qrMatrix(text)
  const quiet = 4
  let path = ''
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (matrix.dark(row, col)) path += `M${col + quiet} ${row + quiet}h1v1h-1z`
    }
  }
  return { path, size: matrix.size + quiet * 2 }
}

const escapeXml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!)

/** A printable card (F2-12): the QR, who it is for, and the expiry. */
export function qrCardSvg(options: { url: string; toName: string; expiresLabel: string }): string {
  const { path, size } = qrPath(options.url)
  const width = 600
  const height = 820
  const qrSide = 480
  const scale = qrSide / size
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" rx="32" fill="#d8c9b0"/>
<text x="300" y="96" font-size="40" text-anchor="middle" fill="#1a1614" font-family="sans-serif">${escapeXml(options.toName)}へ</text>
<text x="300" y="146" font-size="26" text-anchor="middle" fill="#1a1614" font-family="sans-serif">ちょっとした冒険を</text>
<rect x="60" y="180" width="${qrSide}" height="${qrSide}" fill="#ffffff"/>
<path transform="translate(60 180) scale(${scale})" d="${path}" fill="#1a1614"/>
<text x="300" y="730" font-size="22" text-anchor="middle" fill="#1a1614" font-family="sans-serif">カメラで読み取ってね</text>
<text x="300" y="770" font-size="20" text-anchor="middle" fill="#6b3030" font-family="sans-serif">${escapeXml(options.expiresLabel)}</text>
</svg>`
}

export function expiresLabel(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日まで`
}
