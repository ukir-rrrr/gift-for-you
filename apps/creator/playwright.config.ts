import { defineConfig } from '@playwright/test'

const chromium = process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}

// The Expo web build talks to the real Worker under wrangler dev, with the mock moderation,
// sandbox purchase, and mock push providers from wrangler.jsonc, and a fresh local D1/R2 each run.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120000,
  workers: 1,
  use: {
    viewport: { width: 390, height: 844 },
    baseURL: 'http://127.0.0.1:8081',
    // A step that hangs fails here with its name instead of running into the whole-test timeout.
    actionTimeout: 30000,
    navigationTimeout: 30000,
    trace: 'retain-on-failure',
    launchOptions: chromium,
  },
  webServer: [
    {
      command: 'pnpm --filter @gfy/server run e2e:serve',
      url: 'http://127.0.0.1:8787/api/health',
      reuseExistingServer: false,
      timeout: 120000,
    },
    {
      command: 'pnpm run export:web && node e2e/serve.mjs',
      url: 'http://127.0.0.1:8081/',
      reuseExistingServer: false,
      timeout: 600000,
      env: { EXPO_PUBLIC_PUSH_MOCK: '1', EXPO_PUBLIC_SIGNIN_MOCK: '1', EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1', CI: '1' },
    },
  ],
})
