import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration for the wallet-connect monorepo.
 *
 * Runs the specs in `e2e/` against the example app at
 * `examples/react-example`. The `webServer` block builds the example
 * once and serves it via `vite preview` — closer to production behavior
 * than running `vite dev` (no HMR, no source maps, real bundle).
 *
 * Projects emulate the platforms PLAN.md TASK-503 calls out:
 * - Desktop: Chromium, Firefox, WebKit.
 * - Mobile: iPhone 14 (iOS Safari), Pixel 7 (Android Chrome).
 *
 * Test files are tagged with a project prefix (`mobile-`, `desktop-`,
 * `accessibility-`) via `testMatch` so each project runs only its
 * relevant subset and we don't waste cycles running mobile-only specs
 * on desktop browsers (or vice versa).
 */

// Vite's `localhost` binding resolves to ::1 on macOS by default;
// 127.0.0.1 isn't bound unless `--host` is passed. Use the literal
// `localhost` so the lookup matches what Vite serves.
const BASE_URL = 'http://localhost:5173'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Fail CI if any `test.only(...)` slipped through code review — the
  // `forbidOnly` flag rejects them at config-validation time before any
  // tests run.
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  webServer: {
    // `vite dev` is fine for E2E — no build step, fast iteration. If we
    // ever need a closer-to-prod target, switch to `vite preview`
    // (requires a prior `vite build`).
    command: 'pnpm --filter @monolithlabs-hub/wallet-connect-react-example exec vite dev',
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },

  projects: [
    // --- Accessibility specs run on a single desktop browser. ARIA /
    //     focus / keyboard behavior is browser-agnostic at the level we
    //     test; running on three engines triples the test time for
    //     ~zero additional signal. ---
    {
      name: 'accessibility',
      testMatch: /accessibility\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },

    // --- Example-app smoke spec (PLAN.md TASK-601 acceptance). Tests
    //     that every demo route loads without console errors and that
    //     the modal opens. Single-browser by design — the underlying
    //     engine differences are already covered by the desktop / mobile
    //     specs. ---
    {
      name: 'smoke',
      testMatch: /example-app-smoke\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },

    // --- Desktop specs run on the three engine families. Chromium and
    //     WebKit have different focus / rendering quirks that the
    //     modal must handle. ---
    {
      name: 'desktop-chromium',
      testMatch: /desktop-.*\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'desktop-firefox',
      testMatch: /desktop-.*\.spec\.ts$/,
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'desktop-webkit',
      testMatch: /desktop-.*\.spec\.ts$/,
      use: { ...devices['Desktop Safari'] },
    },

    // --- Mobile specs run on iOS Safari and Android Chrome
    //     emulation. These have distinct UA strings (PLAN-spec splits
    //     "Get" vs "Install"), distinct viewport sizes, and Android
    //     reliably emits touch events while WebKit's emulator can
    //     skip some. ---
    {
      name: 'mobile-iphone',
      testMatch: /mobile-.*\.spec\.ts$/,
      use: { ...devices['iPhone 14'] },
    },
    {
      name: 'mobile-android',
      testMatch: /mobile-.*\.spec\.ts$/,
      use: { ...devices['Pixel 7'] },
    },
  ],
})
