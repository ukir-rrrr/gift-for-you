import Constants from 'expo-constants'
import * as Notifications from 'expo-notifications'
import type { Api } from '../lib/api'
import { PUSH_MOCK } from './config'

export type PushState = 'registered' | 'denied' | 'unconfigured' | 'failed'

/**
 * F2-09: lets the server tell this device when the gift is opened and when the goal is reached.
 * A real Expo push token needs an EAS project id (and APNs/FCM credentials behind it), which this
 * tree does not have; without one, only the mock token is registered.
 */
export async function registerPush(api: Api): Promise<PushState> {
  try {
    if (PUSH_MOCK) {
      await api.registerPush(`mock-${Date.now().toString(36)}`, 'mock')
      return 'registered'
    }
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId
    if (!projectId) return 'unconfigured'
    let permission = await Notifications.getPermissionsAsync()
    if (!permission.granted) permission = await Notifications.requestPermissionsAsync()
    if (!permission.granted) return 'denied'
    const token = await Notifications.getExpoPushTokenAsync({ projectId })
    await api.registerPush(token.data, 'expo')
    return 'registered'
  } catch {
    return 'failed'
  }
}
