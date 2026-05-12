import type { UserConfig } from 'vitest/config'

type CoverageThresholds = {
  lines: number
  functions: number
  branches: number
  statements: number
}

export function createPackageVitestConfig(thresholds: CoverageThresholds): UserConfig {
  return {
    test: {
      environment: 'jsdom',
      globals: false,
      include: ['src/**/*.{test,spec}.{ts,tsx}'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'lcov'],
        reportsDirectory: 'coverage',
        include: ['src/**/*.{ts,tsx}'],
        exclude: ['src/**/*.{test,spec}.{ts,tsx}', 'src/**/__tests__/**'],
        thresholds: {
          lines: thresholds.lines,
          functions: thresholds.functions,
          branches: thresholds.branches,
          statements: thresholds.statements,
        },
      },
    },
  }
}
