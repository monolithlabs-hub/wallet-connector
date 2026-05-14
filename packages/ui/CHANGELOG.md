# @monolithlabs/wallet-connect-ui

## 0.1.0

### Minor Changes

- d9dd47b: Expose `WalletConnectInjectionKey` from the public Vue exports.

  The symbol was previously internal but already documented as "exported for tests that wire a stub manager via `provide` directly". Promoting it from "for tests" to public API enables consumer-side patterns like a per-subtree `<DemoProvider>` component that scopes the manager via `provide(WalletConnectInjectionKey, manager)` instead of `app.use(WalletConnectPlugin)` at the app level. The Vue example app (`examples/vue-example/`) uses this pattern to isolate four demo configurations behind a single hash router.

  No behavior change — `WalletConnectPlugin`, `useWallet`, and `useWalletContext` all keep their existing semantics. The bumps for `@monolithlabs/wallet-connect-react` and `@monolithlabs/wallet-connect-ui` are induced by the `linked` group rule in `.changeset/config.json`.

- bd387eb: TASK-401 — add the headless modal primitives to `@monolithlabs/wallet-connect-ui`.

  Framework-agnostic DOM-level building blocks for accessible modal dialogs. No React or Vue imports — `@monolithlabs/wallet-connect-react`'s and `@monolithlabs/wallet-connect-vue`'s `<ConnectButton>` components will migrate onto these in a follow-up so both packages share one implementation of focus trap / scroll lock / ARIA.

  Exports from `@monolithlabs/wallet-connect-ui`:
  - **`attachModal({ root, onRequestClose, initialFocus?, scrollLock?, restoreFocus? })`** — single entry point that wires the full modal lifecycle: capture previous focus, lock body scroll, move initial focus into the dialog (first focusable by default or an explicit target; pass `false` to opt out), install Tab/Shift+Tab focus trap, install Escape handler. Returns a `{ destroy() }` handle; the consumer holds open/close state and calls `destroy()` on close. SSR-safe: returns a no-op handle when `document` is undefined.
  - **`createFocusTrap({ root, onEscape? })`** — narrower primitive for callers that want only the keyboard wrap-around without scroll lock or initial focus. Reads focusables LIVE on every keypress so DOM mutations after attach are picked up automatically.
  - **`getFocusableElements(root)`** — pure DOM query returning focusable descendants in DOM order. Excludes `[disabled]` and `tabindex="-1"`.
  - **`lockBodyScroll()`** — refcounted body scroll lock; nested calls compose, body overflow only restores when the LAST release fires. Returns an idempotent release fn.
  - **`getDialogAttributes(titleId)`** — pure helper returning the standard `{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }` bag for spreading onto the dialog element.

  35 tests across the four modules covering all 5 PLAN.md acceptance criteria (focus cycling, Escape closes, ARIA attributes, scroll lock applied + restored, no framework deps) plus SSR-mode no-op behavior, idempotent destroy, nested-modal scroll-lock composition, initial-focus opt-out, focus restoration. 100% function and line coverage on the modal directory.

  **Note**: the React and Vue `<ConnectButton>` components still inline equivalent logic. A follow-up will migrate them onto `attachModal` so the implementation lives in one place — TASK-203 / TASK-303 explicitly promised this extraction once TASK-401 landed.

- bd387eb: TASK-402 — add the headless wallet-list rendering helpers to `@monolithlabs/wallet-connect-ui`.

  Three pure functions consumed by the React and Vue `<ConnectButton>`s (once they migrate). No DOM access, no platform detection, no framework imports — the consumer pre-computes the inputs and the helpers do the mapping.
  - **`truncatePublicKey(pubkey, head=4, tail=4)`** — returns `${head chars}…${tail chars}` using a Unicode horizontal ellipsis (U+2026). Inputs shorter than `head + tail` are returned verbatim. Defaults match the React / Vue `<ConnectButton>` connected-state display. Handles `tail=0` correctly (JavaScript's `slice(-0) === slice(0)` returns the whole string, so the implementation explicitly guards).
  - **`getInstallBadge({ shouldShow, isIOS })`** — returns `'Get'` on iOS, `'Install'` on Android / desktop, `null` when `shouldShow` is false. Matches the PLAN spec convention (iOS App Store: "Get"; Play Store / Chrome Web Store / Firefox AMO: "Install"). The current React / Vue components show `'Get'` on all mobile (including Android); migrating to this helper will tighten that to iOS-only.
  - **`getWalletStatus({ isConnected, isDetected })`** — returns `'connected' | 'available' | 'install'`. `connected` wins over `detected` (both true → `'connected'`); detected without connected → `'available'`; neither → `'install'`.

  Both `getInstallBadge` and `getWalletStatus` take pre-computed booleans rather than a `PlatformInfo` or `WalletConfig`, keeping the helpers minimal and avoiding a core-types coupling. The consumer maps from whatever shape they have.

  3 test files, 13 cases. 100% function/line coverage on the wallet-list directory.

  **Migration note**: The React (TASK-203) and Vue (TASK-303) `<ConnectButton>` components still inline their own truncation/badge logic. The migration onto these helpers + TASK-401's modal primitives is the natural next polish PR — same as called out in the TASK-401 changeset.

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
