---
---

TASK-503 — Playwright E2E tests covering the full user-facing flows.

Adds a real-browser test suite that exercises the published packages end-to-end through a minimal `examples/react-example` Vite app. Distinct from the jsdom integration tests (TASK-501/502) because focus management, scroll lock, real CSS focus rings, and actual keyboard event semantics diverge from `compareDocumentPosition` ordering — running in Chromium / Firefox / WebKit catches the mismatches a unit-test environment can't.

**29 specs across 6 projects:**

- `accessibility` (Desktop Chrome only — ARIA + focus + keyboard semantics are browser-agnostic at this granularity): 6 specs. ARIA dialog attributes; Escape closes; focus is trapped inside the modal; Shift+Tab from the first focusable wraps to the last; every wallet item is keyboard-reachable; focus is restored to the trigger button on close.
- `desktop-{chromium,firefox,webkit}`: 5 specs × 3 engines. Modal opens; Opindex pinning rule on desktop (NOT first without `window.opindex`, first with it); install badge ("Install") shows on desktop without the extension; no badge when the extension is detected. Engine matrix exists because Chromium and WebKit have meaningfully different focus / rendering behavior the modal must handle.
- `mobile-{iphone,android}`: 4 specs × 2 emulated devices. Opindex appears first on mobile (unconditional pin); install badge label differs per platform ("Get" on iOS, "Install" on Android); tapping Opindex fires the universal-link navigation and the platform-store fallback 1500ms later; the fallback does NOT fire for non-pinned wallets (Phantom directly).

**Key technical decisions baked in:**

- **No StrictMode in the example app's `main.tsx`.** `WalletConnectProvider`'s `useEffect` cleanup destroys the manager during StrictMode's dev-only mount→unmount→remount cycle; the next render then touches the destroyed manager (`WalletManager has been destroyed`). Known Phase 2 limitation; the eventual `<WalletConnectProvider manager={...}>` API will let consumers construct the manager outside the component and dodge this.
- **Mobile navigation interception uses `route.fulfill({status: 204})`, not `route.abort()`.** Chromium navigates to a `chrome-error://chromewebdata/` page on `abort()`, destroying the React context before the 1500ms fallback can fire. A 204 No Content response leaves the page state intact on all three engines, and the captured URL is enough for the assertion.
- **`baseURL: 'http://localhost:5173'` (literal `localhost`, not `127.0.0.1`).** Vite binds to `::1` on macOS by default; `127.0.0.1` isn't bound unless `--host` is passed.
- **`webServer` runs `vite dev`, not `vite preview`.** Faster iteration; no build step on every test run. Bundle-level regressions are caught by the prior `pnpm build` step.

**Wiring:** root `playwright.config.ts` + `e2e/{accessibility,desktop-flow,mobile-flow}.spec.ts`. Root `package.json` adds `@playwright/test@^1.60.0` as a devDep plus two scripts: `pnpm e2e` (run the suite) and `pnpm e2e:install` (install the browser binaries). `examples/react-example/` is a standalone workspace package — Vite 8 + React 19 + `@vitejs/plugin-react@6` + workspace deps on `@monolithlabs/wallet-connect-{core,react}`. The `.gitignore` is extended to drop Playwright's per-run artifacts (`test-results/`, `playwright-report/`).

No source changes in the four library packages — pure additions outside the `packages/*` tree. No version bump for any published package (the empty `---` frontmatter is intentional — TASK-503 is repo-internal tooling).
