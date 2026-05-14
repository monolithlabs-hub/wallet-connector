# @monolithlabs/wallet-connect-vue

## 0.1.0

### Minor Changes

- d9dd47b: Expose `WalletConnectInjectionKey` from the public Vue exports.

  The symbol was previously internal but already documented as "exported for tests that wire a stub manager via `provide` directly". Promoting it from "for tests" to public API enables consumer-side patterns like a per-subtree `<DemoProvider>` component that scopes the manager via `provide(WalletConnectInjectionKey, manager)` instead of `app.use(WalletConnectPlugin)` at the app level. The Vue example app (`examples/vue-example/`) uses this pattern to isolate four demo configurations behind a single hash router.

  No behavior change — `WalletConnectPlugin`, `useWallet`, and `useWalletContext` all keep their existing semantics. The bumps for `@monolithlabs/wallet-connect-react` and `@monolithlabs/wallet-connect-ui` are induced by the `linked` group rule in `.changeset/config.json`.

- bd387eb: Phase 4 follow-up — migrate the React and Vue `<ConnectButton>`s onto the headless `wallet-connect-ui` primitives.

  **`@monolithlabs/wallet-connect-core`** (minor):
  - `PlatformInfo` gains `isIOS: boolean` and `isAndroid: boolean`. `detectPlatform()` parses `navigator.userAgent` for both. `isMobile` is now equivalent to `isIOS || isAndroid` (semantics unchanged; just derives from the more granular flags). Test fixtures across the workspace updated.

  **`@monolithlabs/wallet-connect-react`** (minor):
  - `<ConnectButton>`'s `WalletModal` no longer inlines focus trap / initial focus / focus restoration / Escape handling. All four are delegated to `attachModal` from `@monolithlabs/wallet-connect-ui`. **Body scroll lock is now applied while the modal is open** — was missing in the prior implementation.
  - Modal ARIA attributes (`role`, `aria-modal`, `aria-labelledby`) come from `getDialogAttributes(titleId)`.
  - Public-key truncation in the connected-state label uses `truncatePublicKey` from ui.
  - Install-badge logic uses `getInstallBadge({ shouldShow, isIOS: platform.isIOS })`. **Android now correctly shows "Install" instead of "Get"** — PLAN-spec parity; iOS keeps "Get".
  - ~80 lines of inlined logic removed; the component delegates lifecycle to the headless package and keeps only the JSX shape + inline styling.

  **`@monolithlabs/wallet-connect-vue`** (minor):
  - Same migration as React. `<ConnectButton.vue>`'s `watch(open)` now calls `attachModal` instead of running an inline focus trap + keydown listener.
  - Same Android-badge fix.
  - Same scroll-lock addition.

  **`@monolithlabs/wallet-connect-ui`** (patch):
  - Dropped the unused `@monolithlabs/wallet-connect-core` `dependencies` entry. The Phase 4 helpers take pre-computed primitives; no core types are imported. (The core dep will return naturally if a future convenience layer accepts `WalletConfig` directly.)

  **Behavior changes** (consumer-visible):
  - Android opens to the wallet modal: Opindex's badge now reads "Install" instead of "Get". Matches the Play Store install button.
  - Both React and Vue modals lock body scroll while open. Mobile + desktop.
  - Focus-trap selector is the tightened ARIA list (now includes `iframe`, `details > summary`, `[contenteditable]`, `audio/video [controls]` per TASK-401 polish — both components inherit for free).

  **Test fixtures** updated across `core/platform/detector.test.ts`, `core/wallets/sorter.test.ts`, `core/wallet-manager.test.ts`, `react/.../connect-button.test.tsx`, `vue/.../ConnectButton.test.ts` to include the new `isIOS` / `isAndroid` fields. No test logic changes — the mobile fixtures default to `isIOS: true, isAndroid: false` to preserve the existing "Get on mobile" expectation in those tests.

- 756b00f: TASK-301 — add the `useWallet()` Vue 3 composable.

  `packages/vue/src/composables/use-wallet.ts` exports `useWallet()` plus the `UseWalletReturn` type. Reads the `WalletManager` from `WalletConnectInjectionKey` (TASK-302's `<WalletConnectPlugin>` will `app.provide()` it); throws "must be used inside an app that installs WalletConnectPlugin" if no injection is present.

  Reactivity is bridged by two source-of-truth refs (`ref<FlowState>` for state, `shallowRef<FlowContext>` for context) updated by a single `manager.subscribe` callback. The public surface is derived via `computed`: `publicKey`, `signature`, `wallet`, `sortedWallets`, `error`, `isConnecting` / `isConnected` / `isSigning` / `isAuthenticated`, plus the `connecting` / `connected` aliases. Methods: `select`, `connect(walletId?)`, `disconnect`, `signMessage`, `signIn` — all matching the React hook's polished surface (including the same-handler-safe `select() + connect()` pattern via a non-reactive sync slot).

  **Lifecycle**: subscribes in `setup()` on the client only (gated by `typeof window !== 'undefined'` for SSR-safety); calls `manager.initialize()` in `onMounted`; unsubscribes in `onUnmounted`. Refreshes refs after `initialize()` to belt-and-suspenders against the (vanishingly rare) case where the initialize finishes between subscribe-setup and the first `notify`.

  Companion exports: `WalletConnectInjectionKey` (the `InjectionKey<WalletManager>` symbol) and `useWalletContext()` (the lower-level escape hatch that returns the raw manager, mirroring the React package).

  New devDeps: `vue@^3.5.34`, `@vue/test-utils@^2.4.10`.

  15 composable tests covering all 5 PLAN.md cases (idle on mount, initialize on mount, reactive template re-render, connect with walletId, isConnected computed, unsubscribe on unmount) plus 9 extras (same-handler select+connect regression, error reactive, signature exposure, disconnect toggling, signMessage/signIn delegation, throw without Plugin). Composable file at 100% line coverage.

- 756b00f: TASK-302 — add `WalletConnectPlugin` to `@monolithlabs/wallet-connect-vue`.

  A Vue 3 plugin that creates a single `WalletManager` per app and `app.provide()`s it under `WalletConnectInjectionKey`. The composables (`useWallet`, `useWalletContext`) and the future `<ConnectButton.vue>` (TASK-303) all read from this injection.

  ```ts
  import { createApp } from 'vue'
  import { WalletConnectPlugin } from '@monolithlabs/wallet-connect-vue'

  const app = createApp(App)
  app.use(WalletConnectPlugin, {
    wallets: [phantom, solflare, opindex],
    requireSignIn: true,
    signInMessage: (pk) => `Sign in to MyApp as ${pk}`,
  })
  app.mount('#app')
  ```

  Typed as `Plugin<[WalletManagerConfig]>` — the config arg is required, TS catches missing configs at the call site.

  **Lifecycle**: manager is built once per `install` call. `app.onUnmount(() => manager.destroy())` cleans up on `app.unmount()` (relevant for tests and SSR; long-lived SPAs never trigger it). SSR-safe: `detectPlatform()` resolves to `install-prompt` on the server, so neither the Wallet-Standard discovery nor the deep-link adapter is created — the manager is essentially inert until hydration.

  Installing the plugin twice on the same app creates two managers and leaks the first — documented in JSDoc as a "don't do this", no runtime guard. Both Phase 2 (React Provider) and Phase 3 (Vue Plugin) share this footgun; future package-level `manager: WalletManager` prop API would eliminate it.

  7 plugin tests covering all 3 PLAN.md acceptance criteria (install doesn't throw, single manager per app, no-plugin error) plus 4 extras: config passed to createWalletManager, useWallet picks up the provided manager, useWalletContext does too, destroy fires on `app.unmount()`.

- 756b00f: TASK-303 — add `<ConnectButton>` Vue SFC to `@monolithlabs/wallet-connect-vue`.

  Mirrors the React `<ConnectButton>` in behavior — same modal shell, focus trap, ARIA, "Get" / "Install" badge logic, truncated-pubkey display when connected, Disconnect view — implemented as a Vue 3 single-file component using `<script setup lang="ts">`. Uses `useWallet()` internally; reads platform via `detectPlatform()` cached on first render.

  **API parity with the React version**, with idiomatic Vue conventions where they differ:
  - Props: `label?: string` (default `"Connect Wallet"`), `connectedLabel?: string` (default `"Connected"`).
  - Emits: `connected (publicKey)`, `authenticated (publicKey, signature)` — replaces React's `onConnected` / `onAuthenticated` callback props.
  - `class` / `style` forwarding: relies on Vue's attribute inheritance — `<ConnectButton class="…" style="…">` applies to the rendered `<button>` automatically. No explicit class / style props.

  **Modal improvements over the React version**:
  - Uses Vue's built-in `<Teleport to="body">` so the modal isn't clipped by transformed ancestor containers (React still has this caveat — `position: fixed` inside a CSS-transformed parent).
  - Same accessibility floor: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Tab/Shift+Tab focus trap, Escape to close, focus restoration to the trigger on close.
  - Auto-closes on the `authenticated` transition (not `connected`), so SIWS flows keep the dialog visible through `signing` — same fix as the React polish.

  **Build tooling for SFCs** (new devDeps + config changes):
  - `@vitejs/plugin-vue` for vitest's vite pipeline.
  - `unplugin-vue/esbuild` for tsup's bundling pass.
  - `vue-tsc` replaces plain `tsc` for typecheck AND for `.d.ts` emission (two-step build: `tsup && vue-tsc -p tsconfig.build.json`).
  - `src/shims-vue.d.ts` ambient declaration so any future tooling that doesn't understand SFCs (or a consumer's plain `tsc` setup) at least resolves `.vue` imports to a generic `DefineComponent`.
  - `package.json#exports` `require.types` now points to `./dist/index.d.ts` (no separate `.d.cts` — `vue-tsc` doesn't emit dual type files and types are identical across module formats).

  20 tests covering all 6 PLAN.md acceptance cases plus full parity with the React test suite (custom label, Install badge, no-badge-with-extension, Shift+Tab wrap, backdrop-vs-dialog click, both lifecycle emits, auto-close + signing-state behavior, focus restoration, error rendering). Component file at 97% line coverage / 92.92% statements.

- 0d3298d: TASK-601 / TASK-602 / TASK-603 / TASK-604 / TASK-605 / TASK-606 / TASK-607 / TASK-608 / TASK-609 — Phase 6 wallet-list UX upgrade. Brings the modal to feature parity with `@solana/wallet-adapter-react-ui`.

  Four user-facing changes:
  1. **Auto-merge of Wallet Standard wallets** (default on, no flag). Any wallet the browser registers with the Wallet Standard registry — Phantom, Solflare, Backpack, Coinbase, Trust, Torus, etc. — is auto-added to the modal list with its name + icon from the spec, even when it isn't in `WalletManagerConfig.wallets`. Consumer's curated list still takes priority and pins; auto-detected ones append at the tail.
  2. **"Detected" badge** on every installed wallet, whether configured-and-detected or discovered-only. Replaces the old "no badge" state for installed wallets — matches the de-facto wallet-adapter UX.
  3. **CSS variable surface** for theming. Every visual value (`--wc-bg`, `--wc-fg`, `--wc-accent`, `--wc-radius`, `--wc-badge-bg`, `--wc-detected-bg`, …) reads from a custom property with an inline fallback. Set the variables on `:root`, on `[role="dialog"]`, on `[data-wc-modal]`, or on any ancestor. Hover and focus-visible rules are auto-injected via `injectModalStyles()` (idempotent, SSR no-op).
  4. **`WalletListEntry[]` return type from `WalletManager.getSortedWallets()`** — breaking. Each entry carries `id`, `name`, `icon`, `priority`, `isDetected`, `source: 'configured' | 'discovered'`, plus the consumer-supplied deep-link fields on configured entries. `useWallet().sortedWallets` and `useWallet().wallet` narrow accordingly in both React and Vue.

  Adds:
  - `packages/core/src/wallets/list-entry.ts` — `WalletListEntry`, `mergeWalletList(configured, adapters)`, `walletNameSlug(name)`.
  - `packages/ui/src/wallet-list/badge.ts` gains `getStatusBadge({status, isIOS})` returning `'Detected' | 'Get' | 'Install' | null`. The narrower `getInstallBadge` remains exported for backward-compat.
  - `packages/ui/src/modal/styles.ts` — `injectModalStyles()` + `MODAL_CSS_VARS` typed catalog.
  - `WalletManager.connect(walletId)` now resolves discovered-only wallets via slugified `wallet.name` (e.g., `connect('backpack')` works without a matching `WalletConfig` entry).
  - `WalletManager.getSortedWallets()` post-processes `isDetected: true` onto the pinned wallet when the legacy `window.opindex` sentinel is set — preserves the existing legacy detection path.
  - Initial-letter avatar replaces the gray placeholder square when `wallet.icon` is empty.
  - `data-wc-modal`, `data-wc-wallet-item`, `data-wc-modal-close` attributes on the relevant elements for the hover / focus-visible CSS hooks.

  Tests:
  - `list-entry.test.ts` (16 tests) — merge algorithm, slug rules, dedup by standardName and case-insensitive name, icon fallback, discovered-only entry shape, slug collision defense, no input mutation.
  - `discovered-only-connect.test.ts` (5 integration tests) — end-to-end connect to a Wallet Standard wallet not in the config, with case-insensitive name matching and disconnect.
  - Badge + status helper coverage expanded.
  - Modal styles injection coverage (SSR no-op, idempotency, no default-declaration shadow).
  - Three new Playwright desktop specs: discovered-only wallet with "Detected" badge, configured-and-detected Phantom with "Detected" badge, CSS variable override changes the dialog's computed background. Two existing specs renamed from "NO badge" to "Detected badge" to match the new semantics.

  Example app (`examples/react-example/src/App.tsx`):
  - Drops the `icon: ''` placeholders on Phantom and Solflare — discovery fills them from Wallet Standard.
  - Adds `standardName: asWalletName('Phantom' / 'Solflare')` so the merge prefers exact match.
  - Keeps a real (inline SVG data-URI) icon for Opindex (Opindex isn't Wallet Standard; discovery can't fill it).

  Breaking change scope: the only API change is the return type of `WalletManager.getSortedWallets()` (and the matching narrow in `useWallet().sortedWallets` / `useWallet().wallet`). The input shape `WalletConfig` is unchanged. All four packages are still `private: true` and pre-1.0, so a minor bump is sufficient per `.changeset/config.json`.

  Test counts (post-merge): core 372 (was 367; +5 discovered-only integration), ui 65 (+4 status badge, +5 styles), react 61 (+3 detected/discovered renders), vue 51 (+3 detected/discovered renders). Playwright 44 (was 35; +3 specs × 3 desktop projects). Total: 549 vs. 482.

### Patch Changes

- Updated dependencies [d9dd47b]
- Updated dependencies [bd387eb]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [4eb5a9e]
- Updated dependencies [b7ebbd0]
- Updated dependencies [bd387eb]
- Updated dependencies [bd387eb]
- Updated dependencies [0d3298d]
- Updated dependencies [0d3298d]
- Updated dependencies [0d3298d]
  - @monolithlabs/wallet-connect-ui@0.1.0
  - @monolithlabs/wallet-connect-core@0.1.0
