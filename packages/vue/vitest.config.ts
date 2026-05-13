import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

import { createPackageVitestConfig } from '../../vitest.shared'

const base = createPackageVitestConfig({
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80,
})

// Merge in:
// - the Vue SFC plugin (so vitest's vite-based pipeline understands
//   `.vue` imports);
// - a setupFile that registers `enableAutoUnmount(afterEach)` once for
//   the whole package — see `vitest.setup.ts` for the why.
export default defineConfig({
  ...base,
  plugins: [vue()],
  test: {
    ...base.test,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      ...base.test?.coverage,
      include: ['src/**/*.{ts,tsx,vue}'],
      exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**'],
    },
  },
})
