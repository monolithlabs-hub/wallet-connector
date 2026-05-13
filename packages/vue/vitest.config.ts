import { defineConfig } from 'vitest/config'

import { createPackageVitestConfig } from '../../vitest.shared'

const base = createPackageVitestConfig({
  lines: 80,
  functions: 80,
  branches: 80,
  statements: 80,
})

// Merge in a setupFile that registers `enableAutoUnmount(afterEach)` once
// for the whole Vue package — see `vitest.setup.ts` for the why.
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    setupFiles: ['./vitest.setup.ts'],
  },
})
