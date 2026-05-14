# @monolithlabs/wallet-connect-react

## 0.1.0

### Minor Changes

- d9dd47b: Expose `WalletConnectInjectionKey` from the public Vue exports.

  The symbol was previously internal but already documented as "exported for tests that wire a stub manager via `provide` directly". Promoting it from "for tests" to public API enables consumer-side patterns like a per-subtree `<DemoProvider>` component that scopes the manager via `provide(WalletConnectInjectionKey, manager)` instead of `app.use(WalletConnectPlugin)` at the app level. The Vue example app (`examples/vue-example/`) uses this pattern to isolate four demo configurations behind a single hash router.

  No behavior change — `WalletConnectPlugin`, `useWallet`, and `useWalletContext` all keep their existing semantics. The bumps for `@monolithlabs/wallet-connect-react` and `@monolithlabs/wallet-connect-ui` are induced by the `linked` group rule in `.changeset/config.json`.

- b7ebbd0: Phase 2 polish — three follow-up fixes from the holistic review.

  **1. Fix the `useWallet().select() + .connect()` stale-closure bug.** `select()` now writes to both `useState` (for re-render) and a synchronous `useRef` (for read-after-write). `connect()` reads the ref, so calling `select(id); await connect()` in the same event handler — the documented wallet-adapter-react migration pattern — actually works. Previously, `connect`'s closure captured the pre-`select` `selectedWalletId` value and threw `WalletConnectionError('No wallet selected')`.

  `connect` also gained an optional `walletId` argument: `wallet.connect('phantom')` skips the React state cycle entirely. `<ConnectButton>` now uses this form (and no longer reaches into `useWalletContext()` for the direct-`manager.connect` workaround it previously needed).

  **2. Add `signature` to `useWallet`'s return shape.** It was the only `FlowContext` field missing from the hook surface. `<ConnectButton>` previously read it via `useWalletContext().getContext().signature`; it now reads `wallet.signature` directly. Consumers building custom auth UI no longer need to reach for the lower-level hook to display the SIWS signature. Cleared on `RESET` (matches every other context field).

  **3. Add a vitest setup file so DOM cleanup is automatic.** `packages/react/vitest.setup.ts` registers `afterEach(cleanup)` once for the whole React package and is wired into `packages/react/vitest.config.ts` via `setupFiles`. `vitest.shared.ts` sets `globals: false`, which had disabled `@testing-library/react`'s auto-cleanup hook — previously, only `connect-button.test.tsx` knew to call `cleanup()` manually. Any future React test using `render()` + `screen.getByRole(...)` is now safe by default.

  Side effect: `<ConnectButton>` is now a pure `useWallet()` consumer — no `useWalletContext()` import. The hook is the canonical surface; the context-level escape hatch stays available for advanced consumers but the built-in component doesn't need it.

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

- b7ebbd0: TASK-201 — add the `useWallet()` React hook to `@monolithlabs/wallet-connect-react`.

  **React side**:
  - `useWallet(config?: WalletManagerConfig): UseWalletReturn` — primary public hook. Subscribes to a shared `WalletManager` via `useSyncExternalStore` (handles concurrent rendering and StrictMode automatically).
  - `WalletConnectContext` — internal `React.Context<WalletManager | null>` exported so the upcoming `<WalletConnectProvider>` (TASK-202) and integration tests can supply a manager. End-users should prefer the Provider once it lands.
  - Return shape mirrors `@solana/wallet-adapter-react`'s `WalletContextState` where the fields overlap (`wallet`, `publicKey`, `connecting`, `connected`, `disconnecting`, `select`, `connect`, `disconnect`, `signMessage`, `signIn`), with this library's additions on top (`state`, `sortedWallets`, `isConnecting` / `isConnected` / `isSigning` / `isAuthenticated`, `error`). Consumers migrating from wallet-adapter-react change their import path; runtime semantics match.
  - `wallet` is this library's `WalletConfig` (display metadata), not wallet-adapter's `Wallet` adapter wrapper — same field name, slightly different shape.
  - Behavior: `manager.initialize()` runs once per manager identity in a `useEffect`. `select(walletId)` stores a pre-connect selection; `connect()` uses it (or the FlowMachine's current `walletId`). `disconnect()` toggles a local `disconnecting` flag around the manager call — the FlowMachine collapses disconnect into a sync `RESET`, so there's no observable state for it otherwise.
  - Two entry points: `useWallet(config)` self-owns a manager scoped to the component and destroys it on unmount; `useWallet()` reads from the Provider context (throws a descriptive error if neither is available). Inline `{...}` configs will recreate the manager every render — memoize at the call site or use the Provider.

  **Core side** (small extension in service of TASK-201's compat shape):
  - `WalletManager` now exposes `signMessage(message)` and `signIn(input?)`. They delegate to the active `StandardWalletAdapter` on the extension / in-app-browser path. On the mobile deep-link path they throw `WalletNotReadyError` — mobile uses bundled SIWS via `requireSignIn: true`, not standalone post-connect signs. Throws `WalletNotConnectedError` if no wallet is connected, and after `destroy()`.
  - `SolanaSignInInput` / `SolanaSignInOutput` are now re-exported from `@monolithlabs/wallet-connect-core`'s types barrel. Downstream packages typing against `WalletManager.signIn` no longer need to add `@solana/wallet-standard-features` as a direct dependency.

- b7ebbd0: TASK-202 — add `<WalletConnectProvider>` and `useWalletContext()` to `@monolithlabs/wallet-connect-react`.

  **`<WalletConnectProvider config={...}>`** wraps a subtree and shares a single `WalletManager` with every `useWallet()` / `useWalletContext()` underneath it. The manager is built once via `useState`'s lazy initializer (so the side-effecting factory doesn't run more than necessary), recreated when the `config` prop **identity** changes (React-documented "adjust state on prop change" pattern — `setState` during render), and destroyed both when a new config takes over and on unmount. The provider renders `<WalletConnectContext.Provider>` directly with no DOM wrapper.

  Caveat documented in JSDoc: don't pass an inline `{...}` literal as `config` — the manager will be recreated on every parent render. Define the config once at module scope or memoize it.

  **`useWalletContext()`** reads the manager directly from context; throws `useWalletContext() must be used inside a <WalletConnectProvider>` if no provider is present. Lower-level than `useWallet()` — reach for it when you need the raw manager (e.g., to call methods outside `useWallet`'s return shape, or to build alternative React integrations on top of the manager).

  `useWallet()` continues to support both modes from TASK-201: read from a provider (preferred), or pass `config` directly to self-own a manager scoped to the calling component.

  8 provider tests covering the 4 PLAN.md cases (manager in context, useWallet reads from provider, single instance across consumers, descriptive no-provider error) plus 4 extras: no-DOM-wrapper, destroy-on-unmount, recreate + destroy-old on config identity change, stable across re-renders with the same config reference. All context files at 100% coverage.

- b7ebbd0: TASK-203 — add `<ConnectButton>` to `@monolithlabs/wallet-connect-react`.

  A ready-to-use button that runs the full wallet connect flow. Disconnected: shows a configurable label (default `"Connect Wallet"`) and opens a modal with the sorted wallet list. Connected: shows a truncated public key (`ABCD…WXYZ`) and opens a "connected" view with a Disconnect action. The pinned wallet (Opindex) carries a "Get" badge on mobile (iOS can't probe for installed apps) and an "Install" badge on desktop without the Opindex extension detected; no badge on desktop with the extension.

  Props (per PLAN.md spec): `label`, `connectedLabel`, `className`, `style`, `onConnected(publicKey)`, `onAuthenticated(publicKey, signature)`. The lifecycle callbacks fire on the FlowMachine's connected / authenticated transitions and are additive to the manager-level callbacks (consumers can use either or both).

  **Accessibility**: the modal is `role="dialog"`, `aria-modal="true"`, `aria-labelledby` linked to the heading. Focus moves to the first focusable element on open (the Close button). Tab/Shift+Tab cycles focus within the modal. Escape closes. Clicking the backdrop closes; clicks on the dialog interior do not.

  **Implementation note**: this is the first React component, and TASK-401/402 (the headless `@monolithlabs/wallet-connect-ui` package) haven't shipped yet. The modal shell, focus-trap, and wallet-list-item are inline in `connect-button.tsx` and will be extracted into the UI package when it lands; consumers won't notice the swap.

  **Stale-closure footnote**: `ConnectButton` uses `manager.connect(walletId)` from `useWalletContext()` rather than `useWallet().select(id); useWallet().connect()`. The latter has a real bug — `wallet.connect` closes over the pre-`select` value of `selectedWalletId` in the same event handler. This is a known follow-up on the TASK-201 hook.

  **New devDep**: `@testing-library/user-event@^14.6.1` for keyboard interaction tests.

  19 tests covering all 9 PLAN.md acceptance cases plus 10 extras: custom label, Opindex "Install" badge on desktop, Opindex no badge on desktop with extension, Shift+Tab wrap-around, backdrop-vs-dialog click, onConnected and onAuthenticated callback firing, auto-close on successful connect, error rendering in the modal.

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
