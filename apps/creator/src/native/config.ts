/** Worker origin: the API and the player bundle the preview loads. Set EXPO_PUBLIC_API_ORIGIN per build. */
export const API_ORIGIN = (process.env.EXPO_PUBLIC_API_ORIGIN ?? 'http://127.0.0.1:8787').replace(/\/$/, '')

/** Local runs and e2e register a fake push token so the mock notifier has somewhere to send. */
export const PUSH_MOCK = process.env.EXPO_PUBLIC_PUSH_MOCK === '1'
