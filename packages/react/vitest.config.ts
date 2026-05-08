import { defineConfig } from 'vitest/config'
import { createPackageVitestConfig } from '../../vitest.shared'

export default defineConfig(
  createPackageVitestConfig({ lines: 80, functions: 80, branches: 80, statements: 80 })
)
