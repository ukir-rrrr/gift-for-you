import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/public/assets/**',
      '**/e2e/screenshots/**',
      '**/playwright-report/**',
      '**/.wrangler/**',
      '**/.expo/**',
      '**/web-build/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
