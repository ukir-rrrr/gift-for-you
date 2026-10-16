import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  timeout: 45000,
  use: {
    viewport: { width: 390, height: 844 },
    baseURL: 'http://127.0.0.1:5173',
    // Lets a sandbox with a different bundled Chromium point at it; CI leaves this unset.
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173/g/demo?e2e=1',
    reuseExistingServer: false,
    timeout: 30000,
  },
})
