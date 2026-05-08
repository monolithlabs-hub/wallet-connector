import { defineConfig } from 'vitest/config'
import { createPackageVitestConfig } from '../../vitest.shared'

export default defineConfig(
  createPackageVitestConfig({ lines: 90, functions: 90, branches: 90, statements: 90 })
)
