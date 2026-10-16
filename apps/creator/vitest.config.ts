import { defineConfig } from 'vitest/config'

// Unit tests cover src/lib only; it imports nothing from React Native.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
