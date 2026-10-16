import AsyncStorage from '@react-native-async-storage/async-storage'
import type { KV } from '../lib/storage'

export const kv: KV = {
  getItem: (key) => AsyncStorage.getItem(key),
  setItem: (key, value) => AsyncStorage.setItem(key, value),
  removeItem: (key) => AsyncStorage.removeItem(key),
  getAllKeys: () => AsyncStorage.getAllKeys(),
}
