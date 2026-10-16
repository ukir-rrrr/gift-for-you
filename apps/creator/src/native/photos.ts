import { base64ToBytes } from '@gfy/imaging'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import * as ImagePicker from 'expo-image-picker'
import { cleanJpeg, resizeTarget } from '../lib/photo'

export type PickedPhoto = { bytes: Uint8Array; width: number; height: number }

export type PickResult = { ok: true; photo: PickedPhoto } | { ok: false; reason: 'cancelled' | 'denied' | 'unreadable' }

/**
 * F2-03: picks one photo and re-encodes it on the device. Re-encoding drops Exif (GPS included);
 * cleanJpeg strips anything an encoder still left and checks the 1080px long edge.
 */
export async function pickPhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync()
  if (!permission.granted) return { ok: false, reason: 'denied' }
  const picked = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, exif: false, allowsMultipleSelection: false })
  if (picked.canceled || !picked.assets?.[0]) return { ok: false, reason: 'cancelled' }
  const asset = picked.assets[0]
  try {
    const context = ImageManipulator.manipulate(asset.uri)
    const target = resizeTarget(asset.width, asset.height)
    if (target) context.resize(target)
    const image = await context.renderAsync()
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true })
    if (!saved.base64) return { ok: false, reason: 'unreadable' }
    const base64 = saved.base64.replace(/^data:image\/\w+;base64,/, '')
    return { ok: true, photo: cleanJpeg(base64ToBytes(base64)) }
  } catch {
    return { ok: false, reason: 'unreadable' }
  }
}
