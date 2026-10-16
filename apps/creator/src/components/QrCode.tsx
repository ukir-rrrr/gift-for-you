import { useMemo } from 'react'
import Svg, { Path, Rect } from 'react-native-svg'
import { qrPath } from '../lib/qr'

export function QrCode({ value, size = 220, testID }: { value: string; size?: number; testID?: string }) {
  const { path, size: modules } = useMemo(() => qrPath(value), [value])
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${modules} ${modules}`} testID={testID} accessibilityLabel={`QRコード ${value}`}>
      <Rect width={modules} height={modules} fill="#ffffff" />
      <Path d={path} fill="#1a1614" />
    </Svg>
  )
}
