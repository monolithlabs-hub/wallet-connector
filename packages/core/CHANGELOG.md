# @monolithlabs/wallet-connect-core

## 0.1.0

### Minor Changes

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

- 4eb5a9e: TASK-101 — add `detectPlatform()` to `@monolithlabs/wallet-connect-core`. Inspects `navigator.userAgent` plus `window.solana` / `window.opindex` and returns a `PlatformInfo` whose `strategy` is one of `'extension' | 'deeplink' | 'install-prompt'`. SSR-safe (returns `install-prompt` with all booleans `false` when `window`/`navigator` are absent). A mobile UA with `window.solana` present resolves to `'extension'` so Phantom's in-app browser keeps working.
- 4eb5a9e: TASK-102 — add `getSortedWallets(wallets, platform)` and the `WalletConfig` type to `@monolithlabs/wallet-connect-core`. Pins Opindex (`id === 'opindex'`) at index 0 on mobile unconditionally, and on desktop only when `platform.hasOpindexExtension` is true. After the pin, elevates the wallet matching `localStorage['lastUsedWallet']`. Remaining wallets are sorted ascending by `priority` (stable sort preserves input order on ties). Pure — never mutates the input array. SSR-safe — falls back to no last-used wallet when `localStorage` is unavailable or throws. `WalletConfig` carries an optional `standardName?: WalletName` field for forward compatibility with the Wallet-Standard adapter (TASK-107).
- 4eb5a9e: TASK-103 — add the SessionStore module to `@monolithlabs/wallet-connect-core`. Exports `PendingState` plus six functions: `createPendingState` (generates a UUID v4 nonce via `crypto.randomUUID()` and a `Date.now()` timestamp), `savePendingState`, `getPendingState` (returns `null` for state older than 10 minutes and clears it as a side effect), `clearPendingState`, `saveLastUsedWallet`, and `getLastUsedWallet`. `PendingState` uses `sessionStorage`; `lastUsedWallet` uses `localStorage`. Both paths fall back to an in-memory slot when the relevant Web Storage API is unavailable (SSR, Safari private browsing, blocked cookies), and every operation is non-throwing. `getSortedWallets` (TASK-102) now reads the last-used wallet via `getLastUsedWallet()` instead of touching `localStorage` directly — single source of truth for the `'lastUsedWallet'` key.
- 4eb5a9e: TASK-104 — add the flow `FlowMachine` to `@monolithlabs/wallet-connect-core`. States: `idle | connecting | connected | signing | authenticated | error`. Events: `CONNECT_INITIATED`, `WALLET_CONNECTED`, `SIGN_INITIATED`, `SIGN_COMPLETED`, `ERROR`, `RESET`. `ERROR` is accepted from any non-error state; `RESET` is accepted from any state and clears the context. `WALLET_CONNECTED` with `requireSignIn: false` auto-advances through `connected` to `authenticated` (subscribers see both transitions). Invalid transitions throw with a descriptive message that names the event and the current/expected states. `toJSON()` produces a JSON-safe snapshot that `createFlowMachine(snapshot)` can replay — used by the `WalletManager` to resume a mobile flow after the deep-link round-trip. Errors round-trip via `{ name, message }` and are restored as `WalletError` instances. Exposes `createFlowMachine`, `FlowState`, `FlowEvent`, `FlowContext`, `FlowMachine`, `SerializedFlow`, `StateListener`, and `Unsubscribe`.
- 4eb5a9e: TASK-105 — add the DeepLinkBuilder to `@monolithlabs/wallet-connect-core`. Exports `buildConnectUrl(wallet, options)`, `buildSignAndConnectUrl(wallet, options)`, `generateEphemeralKeypair()`, plus the `EphemeralKeypair`, `ConnectOptions`, `SignConnectOptions`, and `SolanaCluster` types.

  URLs follow Phantom's Universal Link API spec (Solflare and Opindex use the same parameter shape): `<wallet.universalLink>?dapp_encryption_public_key=<base58>&cluster=...&app_url=...&redirect_link=...`. `redirect_link` and `app_url` are validated as absolute http(s) URLs and throw with descriptive messages on relative inputs or non-http(s) schemes (defense against `javascript:` injection). All parameter values are percent-encoded via `URLSearchParams`; an existing `?` in `universalLink` is detected and the new params are joined with `&`.

  Ephemeral x25519 keypairs are generated via `tweetnacl.box.keyPair()`, which seeds from `crypto.getRandomValues` (browser) / Node's `crypto` (server) — never `Math.random`. Each `generateEphemeralKeypair()` call returns a fresh pair; `secretKey` must be persisted by the caller (e.g., via `SessionStore`) so the redirect callback can decrypt the wallet's response on the next page load.

  `buildSignAndConnectUrl` adds a `sign_in_message` query param to the connect URL (forward-compatible: Phantom's `/ul/v1/connect` endpoint does not currently accept this, so combined SIWS at the URL level is a no-op there. The `DeepLinkAdapter` (TASK-108) handles the two-redirect fallback for wallets that don't support a combined endpoint).

  Runtime deps added to `core`: `tweetnacl@^1.0.3`, `bs58@^6.0.0`.

- 4eb5a9e: TASK-106 — add the CallbackHandler to `@monolithlabs/wallet-connect-core`. Exports `isCallbackUrl`, `parseCallback`, `extractCallbackFromCurrentUrl`, plus the `CallbackResult` type. Decrypts the wallet's redirect-callback payload (Phantom's encrypted format: `phantom_encryption_public_key` + `nonce` + `data` query params, base58-encoded) using the dapp's ephemeral secret key via `nacl.box.open` (x25519 ECDH + XSalsa20-Poly1305).
  - `isCallbackUrl(url)` is a cheap structural check (presence of the three params) — does not attempt decryption.
  - `parseCallback(url, ephemeralKeypair)` is pure and total: returns `null` for any malformed input (missing params, base58 errors, wrong-size key/nonce, decryption failure, invalid or wrong-shape JSON), never throws.
  - `extractCallbackFromCurrentUrl(ephemeralKeypair)` is a convenience that reads `window.location.href` and on a successful parse strips the three callback params (plus `errorCode`/`errorMessage`) via `history.replaceState` so a navigation-and-back doesn't re-process. SSR-safe (returns `null` when `window` is undefined). On a failed parse, the URL is **not** modified — matches the PLAN.md acceptance criterion literally; the caller surfaces an error in its UI.

  Two intentional spec deviations (documented in CLAUDE.md):
  1. `extractCallbackFromCurrentUrl` takes `ephemeralKeypair` as a parameter. PLAN.md's signature is `(): CallbackResult | null` but the dapp's secret key has to come from somewhere; `SessionStore` (TASK-103) doesn't yet support persisting keypairs (that's a TASK-108 concern). The caller — `WalletManager` — loads the keypair from PendingState and passes it in.
  2. Error callbacks (Phantom redirects with `errorCode` / `errorMessage` on user rejection) are out of scope for the `CallbackResult` shape. `isCallbackUrl` returns `false` and `parseCallback` returns `null` for them, so the caller treats an error redirect as "no callback" and surfaces its own error via the `WalletManager`'s `onError` handler.

- 4eb5a9e: TASK-107 — port `StandardWalletAdapter` + add `discoverStandardWallets` to `@monolithlabs/wallet-connect-core`. Adapts any Wallet-Standard wallet (Phantom, Solflare, Backpack, Glow, …) to a single async surface: `connect`, `disconnect`, `signMessage`, `signIn`, `subscribe`, `destroy`. `subscribe` emits `'connect' | 'disconnect' | 'accountsChange'` events derived from the wallet's `standard:events` `change` feed.
  - `connect()` resolves with the first authorized account's base58 public key; rejects with `WalletConnectionError` on user cancel or empty account list.
  - `signMessage(bytes)` resolves with the signature `Uint8Array`; rejects with `WalletSignMessageError` on cancel, `WalletNotReadyError` when `solana:signMessage` is missing, `WalletNotConnectedError` when no account is selected.
  - `signIn(input?)` resolves with `SolanaSignInOutput`; rejects with `WalletNotReadyError` when `solana:signIn` is missing, `WalletSignInError` on cancel. Marks the adapter connected on success (signIn implies connect).
  - `disconnect()` calls `standard:disconnect` when available, always clears local state, rejects with `WalletDisconnectionError` if the wallet throws.

  `discoverStandardWallets()` returns a `DiscoveryHandle` over the live `@wallet-standard/app` registry: `getAdapters()`, `subscribe(listener)`, `destroy()`. Seeds with pre-registered wallets, listens to both `register` and `unregister` events, caches one adapter per Wallet object (no duplicates on re-registration), and destroys adapters on unregister. Filter (`isCompatibleStandardWallet`): `standard:connect` + at least one `solana:*` chain — intentionally looser than upstream (no transaction-feature requirement) since this library doesn't handle transactions; the dapp goes through `@wallet-standard/app` directly for those.

  Ported under Apache-2.0 from `@solana/wallet-standard-wallet-adapter-base`. Both files carry a file-level attribution header; `THIRD_PARTY_LICENSES.md` lists their upstream paths.

- 4eb5a9e: TASK-108 — add `DeepLinkAdapter` to `@monolithlabs/wallet-connect-core`. Mobile-flow orchestrator that ties together TASK-105 (DeepLinkBuilder), TASK-106 (CallbackHandler), and TASK-103 (SessionStore). Exports `createDeepLinkAdapter(options)` + 6 types (`DeepLinkAdapter`, `DeepLinkAdapterEvent`, `DeepLinkAdapterListener`, `DeepLinkAdapterOptions`, `DeepLinkAdapterUnsubscribe`, `DeepLinkConnectInput`).

  `connect(input)` generates a fresh ephemeral x25519 keypair, persists state via the SessionStore, navigates the page to the wallet's universal link (`buildSignAndConnectUrl` when `requireSignIn: true`, plain `buildConnectUrl` otherwise), and returns a promise that **never resolves on this page load** — the next page must call `resumeFromCallback()`.

  `resumeFromCallback()` reads `window.location.href`, finds the saved `PendingState`, decodes the keypair, calls `parseCallback` from TASK-106, clears the pending state, remembers the wallet via `saveLastUsedWallet`, and emits `'connect'`. Returns `null` for: no pending state, no callback URL, wrong-shape pending keypair, decryption failure.

  **Opindex App Store / Play Store fallback**: when `wallet.id === 'opindex'` and the UA is mobile, a 1500ms timer fires; if the page is still visible, navigate to `wallet.appStoreUrl` (iOS) or `wallet.playStoreUrl` (Android). The timer is cancelled by a `visibilitychange` to hidden (OS opened the wallet app). Both `navigate` and `scheduleFallback` are injectable for testing.

  **Idempotency**: concurrent `connect()` calls share one inflight promise + one navigation. Sync validation errors (`requireSignIn: true` with no `signInMessage`) throw before the inflight slot is set, so subsequent calls aren't wedged.

  **Out of scope**: standalone `signMessage` / `signIn` throw `WalletNotReadyError`. Bundled SIWS via `requireSignIn: true` is the only signing path. Standalone post-connect signing would require a second redirect round-trip with per-wallet signMessage URL building.

  **Schema change**: `PendingState` extended with `ephemeralPublicKey: string` and `ephemeralSecretKey: string` (both base58); `createPendingState` input shape changed accordingly. The `PendingState.nonce` (UUID v4 replay nonce) is distinct from Phantom's callback URL `nonce` (XSalsa20 IV) — both nonces, different roles; documented inline.

- 4eb5a9e: TASK-109 — add `createWalletManager(config)` to `@monolithlabs/wallet-connect-core`. This is the canonical public API of the core package — every other Phase 1 module (PlatformDetector, FlowMachine, SessionStore, getSortedWallets, StandardWalletAdapter + discovery, DeepLinkAdapter) wires together here.

  **API surface** (`createWalletManager(config: WalletManagerConfig): WalletManager`):
  - `initialize()` — call on page load; resumes a pending mobile deep-link flow if `window.location.href` carries callback params.
  - `getSortedWallets()` — display-ready list per `pinnedWallet` rules.
  - `connect(walletId)` — initiates the flow on the platform-appropriate adapter.
  - `disconnect()` — clears local session and resets the FlowMachine.
  - `getState()` / `getContext()` — read the FlowMachine.
  - `subscribe(listener)` — observe state changes.
  - `destroy()` — tear down discovery + deep-link adapter.

  **Config**: `wallets`, `requireSignIn`, `pinnedWallet` (default `'opindex'`, null disables), `signInMessage`, `cluster` (default `'mainnet-beta'`), `appUrl` (default `window.location.origin`), `callbackPath` (default `window.location.pathname`), plus four lifecycle callbacks: `onStateChange`, `onConnected`, `onAuthenticated`, `onError`.

  **Adapter selection** by `PlatformDetector.strategy`:
  - `'extension'` → match a `StandardWalletAdapter` from `discoverStandardWallets()` by `wallet.standardName` (preferred) or case-insensitive `wallet.name`. SIWS via the adapter's `signMessage`; the signature is base58-encoded for the FlowMachine event.
  - `'deeplink'` → forward to the `DeepLinkAdapter`. `requireSignIn: true` bundles a SIWS message via `buildSignAndConnectUrl`.
  - `'install-prompt'` → throw `WalletNotReadyError` immediately; consumers render an install CTA.

  **Design decisions documented**:
  - `signInMessage` is called with the user's public key on desktop but with an empty string on mobile (the wallet substitutes its own address into the bundled SIWS message — Wallet Standard's `SolanaSignInInput.address` is optional). Consumers must handle the empty-arg case.
  - Lifecycle callbacks (`onConnected`, `onAuthenticated`) fire from explicit code paths in `connect()` and `initialize()`, NOT from FlowMachine subscriptions — ordering is unambiguous and the WalletManager owns the timing.
  - `getSortedWallets` (TASK-102) extended with an optional `SortOptions { pinnedWalletId?: string | null }` third argument — backward compatible. `pinnedWallet: null` disables the platform-aware pin entirely (neutral mode for library consumers).

  Re-exports: `createWalletManager`, `WalletManager`, `WalletManagerConfig` from the package root.

- 4eb5a9e: TASK-110 — centralize all project-specific types into `packages/core/src/types.ts`. The new file is a type-only barrel that re-exports from each producer module, giving consumers a single canonical import path:

  ```ts
  import type {
    WalletConfig,
    FlowState,
    WalletManagerConfig,
  } from '@monolithlabs/wallet-connect-core'
  ```

  The PLAN.md TASK-110 core list (10 types: `WalletConfig`, `WalletManagerConfig`, `FlowState`, `PlatformInfo`, `PendingState`, `CallbackResult`, `WalletAdapter`, `EphemeralKeypair`, `StateListener`, `Unsubscribe`) plus 24 supporting types (`FlowEvent`, `SerializedFlow`, `SortOptions`, `PlatformStrategy`, `ConnectOptions`, `SignConnectOptions`, `SolanaCluster`, all adapter-event/listener/unsubscribe types, all discovery types, `WalletName`) are now reachable from one place.

  **New type**: `WalletAdapter` is defined as `StandardWalletAdapter | DeepLinkAdapter`. The two adapter shapes have intentionally different `connect()` signatures (desktop takes no args; mobile takes input + bundles SIWS), so a single common interface isn't possible. Discriminate at runtime by checking `'wallet' in adapter` (StandardWalletAdapter only) or `'resumeFromCallback' in adapter` (DeepLinkAdapter only). In practice, `WalletManager` (TASK-109) is the canonical consumer and shields downstream code from the union.

  **Implementation note**: type definitions stay in their producer modules — `types.ts` is a barrel of `export type` lines, not a relocation. Less invasive (no cross-module circular-import risk), and a missing re-export fails `tsc --noEmit` on the new `types.test.ts` (which imports every required type and uses each in a typed slot).

  `index.ts` now uses `export type * from './types'` for all type re-exports; value exports (functions, classes, the `WalletReadyState` enum) remain per-module to preserve direct value imports.

  **Tests added**: `types.test.ts` enumerates all 34 re-exported types in a `_Slots` map, runs structural assertions on `FlowState`/`PlatformStrategy`/`SolanaCluster`/`WalletAdapter` shape literals, and verifies the PLAN.md core-list count.

  **Phase 1 complete** with this task. The library now has a fully-typed public surface, comprehensive `WalletManager` API, two platform-aware adapters with discovery, FlowMachine state tracking, SessionStore persistence, and all ported error/ready-state primitives — every Phase 1 task from PLAN.md is implemented and hardened.

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

- 4eb5a9e: FlowMachine hardening (follow-up to TASK-104, in advance of TASK-109 wiring it into the `WalletManager`):
  - `send()` is now non-re-entrant. A subscriber that calls `machine.send(...)` synchronously during notification throws `FlowMachine.send is not re-entrant — a subscriber called send() during notification`. Previously, a re-entrant call could bypass the transition table during the `WALLET_CONNECTED` → `connected` → `authenticated` auto-step.
  - Listener exceptions no longer break dispatch. Each listener call is wrapped; an exception is rethrown asynchronously via `queueMicrotask` (surfacing it to `window.onerror` / Node's unhandled-rejection path) so the auto-step's second `setState` and other listeners still run.
  - `createFlowMachine(snapshot)` now runtime-validates `snapshot.state` against the legal `FlowState` set. A tampered or schema-mismatched snapshot falls back to `'idle'` instead of poisoning the machine.
  - `getContext()` JSDoc clarified: the returned object is a shallow copy; `context.error`, if present, shares identity with the internally-held error. `send()` JSDoc notes non-re-entrancy.
  - `restoreContext` inline-documents the intentional loss of error subclass identity on rehydrate (`instanceof WalletError` survives; `instanceof WalletConnectionError` does not).

  Tests added: re-entrancy throw, listener-exception isolation, snapshot-state validation, ERROR-from-error transition, and the previously-missing illegal-transition pairs (`signing/connected + bad event`, all `authenticated + ...` and `error + ...` non-RESET/ERROR pairs).

- 4eb5a9e: DeepLinkBuilder hardening (follow-up to TASK-105, in advance of TASK-106 / TASK-108 consuming the module):
  - `assertAbsoluteUrl` no longer relies on a string-match (`err.message.includes('must use')`) to decide whether to rethrow the protocol-mismatch error vs. replace it with the absolute-URL error. The two branches are explicit now and robust to future URL-constructor error-message changes.
  - `buildBaseParams` runtime-validates `cluster` (must be `'mainnet-beta'` or `'devnet'`) and `ephemeralKeypair.publicKey.length` (must be 32 bytes). Catches caller mis-wiring at the URL build site instead of letting a malformed URL fail silently inside TASK-108's callback path.
  - Switched URL encoding from `URLSearchParams.toString()` (form-urlencoded: spaces → `+`) to explicit `encodeURIComponent`-per-value joining (RFC-3986 percent encoding: spaces → `%20`). New test pins the choice. No observable change for non-space characters — `&`, `=`, `?`, `/`, `:` all encode identically.
  - `appendParams` handles a `universalLink` that ends with a bare `?` (no double separator).
  - `buildSignAndConnectUrl` JSDoc now carries an `@experimental` tag with the forward-compat caveat about Phantom's `/ul/v1/connect` endpoint not currently consuming `sign_in_message`.
  - `EphemeralKeypair.secretKey` JSDoc forward-links to the SessionStore persistence pattern that TASK-106 / TASK-108 will wire up.

  Tests added: `%20`-not-`+` for spaces; trailing-`?` `universalLink`; invalid-cluster throw; wrong-length publicKey throw; "secretKey never appears in URL" security invariant; base58 round-trip on the generated public key.

- 4eb5a9e: CallbackHandler hardening (follow-up to TASK-106, in advance of TASK-108 consuming the module):
  - `isPhantomCallbackPayload` now rejects empty-string `public_key` / `session` (a tampered or hostile redirect could previously slip through as `{ publicKey: '', session: '' }` and leak into TASK-109's `onConnected('')` callback). Also rejects payloads whose `signature` field is present but not a string — previously silently dropped, now consistent with the "all shape errors → null" pattern used elsewhere.
  - `cleanCallbackParams` now takes the URL we actually parsed instead of re-reading `window.location.href`. Removes a theoretical race where a synchronous navigation between parse and clean would mutate the wrong history entry. Also drops the unreachable `errorCode` / `errorMessage` keys from the delete list — they can never be present on the success path (error redirects fail `isCallbackUrl` earlier).
  - `parseCallback` JSDoc enumerates every failure mode that returns `null`.

  Tests added: empty-string `public_key`; empty-string `session`; non-string `signature`; absent `signature` produces a result without the `signature` property (regression check on the type guard refactor).

- 4eb5a9e: StandardWalletAdapter + discovery hardening (follow-up to TASK-107, in advance of TASK-108 / TASK-109):
  - **Discovery filter now requires `standard:events`.** Wallets lacking the events feature pass the old filter but get an adapter whose `subscribe()` never fires — silent contract violation. The tightened filter excludes them, matching upstream's `@solana/wallet-standard-wallet-adapter-base` expectation.
  - **`connect()` is single-flight.** Concurrent callers share one `feature.connect()` invocation (no double consent prompts, no account-overwrite races). The inflight slot is cleared after success or failure so retries reach the wallet.
  - **`destroy()` disables further use.** An `assertAlive()` guard at the top of `connect` / `disconnect` / `signMessage` / `signIn` / `subscribe` throws `Error("Wallet \"<name>\" adapter has been destroyed")` if called after destroy. `destroy()` itself is idempotent.
  - **JSDoc clarifications**:
    - `subscribe`: explicitly documents that listeners fire on transitions only — no initial-state replay. Consumers reading `isConnected` after creating a pre-authorized adapter must check the getter once.
    - `wallet` getter: notes that calls bypassing the adapter (via `wallet.features[...]`) don't update internal state.
    - `signIn`: notes that the returned `output.account` may not yet be in `wallet.accounts` — a spec-compliant wallet emits `change` immediately after to reconcile.
    - `discoverStandardWallets`: notes that each invocation creates a fresh handle / adapter set; for app-wide use, call once and share.

  Tests added: filter excludes no-events wallet; concurrent `connect()` runs `feature.connect()` once and emits one `'connect'` event; inflight slot clears on failure so retries work; `connect/disconnect/signMessage/signIn/subscribe` each throw after `destroy()`; `destroy()` is idempotent.

- 4eb5a9e: DeepLinkAdapter hardening (follow-up to TASK-108, in advance of TASK-109 consuming the adapter):
  - **`startRedirect` reordered to build-then-save-then-mark-connecting.** A synchronous throw from `buildConnectUrl` / `buildSignAndConnectUrl` (bad `redirectUrl` / cluster / keypair-length) now rolls back cleanly: no pending state persisted, `isConnecting` never flips to `true`. Previously a partial write left orphaned state that survived for 10 minutes until the SessionStore staleness timer expired.
  - **`resumeFromCallback` clears pending state on `parseCallback` failure.** Previously the decryption-failure path returned `null` without clearing, wedging the multi-tab scenario where a callback URL hits the wrong adapter and refresh re-runs the same failing decode.
  - **`resumeFromCallback` pre-checks keypair field types** with `typeof === 'string'` before `bs58.decode`. Pre-TASK-108 `PendingState` records (no `ephemeralPublicKey` / `ephemeralSecretKey`) are detected and cleared without relying on the bs58 catch.
  - **`disconnect()` only clears `sessionStorage` when `isConnected` or `isConnecting`.** A never-connected adapter calling `disconnect()` no longer wipes a sibling adapter's in-flight state (SessionStore is a module-level singleton; without this gate one stray `disconnect` would torpedo any other adapter on the same tab).
  - **Empty `appStoreUrl` / `playStoreUrl` skip the Opindex fallback** and navigate directly to the deep link instead of scheduling a no-op-navigate-to-`""` after 1500ms.
  - **`PendingState` JSDoc** now documents the pre-TASK-108 backwards-compat (older records detected and cleared automatically).

  Tests added: state-not-persisted-on-build-throw; pending-state-cleared-on-decrypt-failure; pre-TASK-108 record auto-clear; cross-adapter session safety (A's pending state survives B's disconnect; A's own disconnect clears it); empty store URLs skip fallback.

- 4eb5a9e: WalletManager hardening (follow-up to TASK-109, in advance of Phase 2 React/Vue consumers wiring it up):
  - **`connect()` auto-resets the FlowMachine when called from a non-idle state.** Previously, a retry after a failed connect (state `'error'`) or re-authenticating with a different wallet (state `'authenticated'`) would crash with "Invalid transition: 'CONNECT_INITIATED' is not allowed from state 'error'" because `CONNECT_INITIATED` only accepts `'idle'`. The auto-RESET makes retry and re-auth Just Work; the consumer no longer has to call `disconnect()` first.
  - **`connect()` is single-flight.** Concurrent callers share one in-flight promise. Prevents the second call's auto-RESET from kicking the first call's in-progress flow back to `'idle'`, and matches the single-flight pattern used by the underlying adapters (TASK-107 / TASK-108).
  - **`destroy()` disables further use.** An `isDestroyed` flag + `assertAlive()` guards on `connect` / `disconnect` / `initialize` / `subscribe` throw `Error('WalletManager has been destroyed')` after destroy. `destroy()` is idempotent and also unsubscribes the internal `onStateChange` bridge from the FlowMachine.
  - **`disconnect()` no longer emits a spurious `onStateChange('idle')` on an already-idle manager.** Gated `machine.send({ type: 'RESET' })` behind `state !== 'idle'`.
  - **Consumer-callback exceptions are isolated.** `onError` / `onConnected` / `onAuthenticated` invocations now go through a `safeCallback` helper that wraps in try/catch + `queueMicrotask` rethrow — matches the FlowMachine listener-isolation pattern (TASK-104). A consumer callback that throws no longer poisons the rest of the connect flow or replaces the original `WalletError` in the rethrow path.
  - **JSDoc** on `WalletManagerConfig.onStateChange` / `onConnected` clarifies that state-change notifications fire BEFORE the lifecycle callbacks (the FlowMachine's auto-step is synchronous inside `machine.send`). Consumers needing the publicKey at the transition tick should read it from `getContext()` inside `onStateChange`.

  Tests added: retry-after-error succeeds; re-auth with a different wallet from `'authenticated'` succeeds; concurrent `connect()` calls share one adapter invocation; `connect` / `disconnect` / `initialize` / `subscribe` all throw after `destroy()`; `destroy()` is idempotent; no spurious `onStateChange('idle')` on never-connected disconnects (desktop AND mobile); a throwing `onConnected` doesn't poison the auth flow; a throwing `onError` doesn't corrupt the rethrown `WalletError`.

- 0d3298d: TASK-501 — integration tests for the full mobile deep-link connect flow.

  Adds `packages/core/src/__tests__/integration/mobile-connect-flow.test.ts`. Exercises the **real** WalletManager + DeepLinkAdapter + FlowMachine + SessionStore + CallbackHandler stack with realistic encrypted callback payloads — the wallet side is simulated via `nacl.box` against the dapp's ephemeral public key (read from sessionStorage). The only seams mocked are `navigator.userAgent` (stubbed to iPhone so `detectPlatform` returns the `deeplink` strategy) and `createDeepLinkAdapter`'s `navigate` (so jsdom doesn't try to follow `phantom://` URLs).

  Six tests covering the PLAN.md acceptance list:
  - **Full round trip** (tap connect → state saved → callback parsed → `onConnected` fired)
  - **Full round trip with sign-in** (`requireSignIn: true` → `onAuthenticated` fired with the wallet's signature)
  - **`requireSignIn: false` skips signing** — even if the wallet returns a signature in the callback, the dapp's flow stays at `authenticated` via auto-step, not via a sign event
  - **Stale pending state (>10 min) is discarded on callback** — SessionStore returns `null` for >10-minute records and clears them on the next read; manager.initialize sees no pending state and bails before touching the callback URL
  - **Malformed callback URL handled gracefully** — `parseCallback` returns null on bad data; `resumeFromCallback` clears the pending state (per TASK-108 docs: "so the user can retry instead of getting wedged for the 10-minute staleness window")
  - **Opindex App Store redirect fires after 1500ms when not installed** — uses `vi.useFakeTimers()` to advance time past the threshold and asserts the second `navigate` call goes to the App Store URL

  Test infrastructure notes:
  - `@vitest-environment-options { "url": "https://dapp.example/" }` pragma at the top of the file — jsdom's default `about:blank` has a null origin and rejects all `history.replaceState` calls; the pragma sets a stable HTTPS origin we can mutate within.
  - `createDeepLinkAdapter` mocked via `vi.mock` to wrap the real implementation with a `navigate` spy. WalletManager doesn't accept an adapter override directly, so this is the integration-test-friendly seam.
  - TextEncoder output wrapped in `new Uint8Array(...)` before passing to `nacl.box` — tweetnacl's strict `instanceof Uint8Array` check rejects the array `TextEncoder.encode()` produces under jsdom realms. Same caveat documented in CLAUDE.md TASK-106.

  No source changes — these are purely test additions. Patch bump.

- 0d3298d: TASK-502 — integration tests for the full desktop extension connect flow.

  Adds `packages/core/src/__tests__/integration/desktop-connect-flow.test.ts`. Exercises the **real** WalletManager + StandardWalletAdapter + FlowMachine + Wallet-Standard discovery stack. The wallet is simulated via a controllable Wallet-Standard `Wallet` object registered with `getWallets()` from `@wallet-standard/app` — the same code path real Phantom / Solflare / Backpack extensions use. No mocks at the manager or adapter level.

  Five tests covering the PLAN.md acceptance list:
  - **connect → extension popup approved → onConnected fired** — full happy path: connect, FlowMachine transitions through `connecting → connected → authenticated`, `lastUsedWallet` persisted to localStorage.
  - **connect → extension popup rejected → onError fired with `WalletConnectionError`** — `standard:connect` feature throws; adapter wraps in `WalletConnectionError`; manager surfaces via `onError`, FlowMachine lands in `error` state.
  - **connect + sign (requireSignIn: true) → onAuthenticated fired with the signature** — verifies the SIWS message body is the dapp-provided one with the public key interpolated; signature is base58-encoded by the manager before emission.
  - **sign rejected → onError fired with `WalletSignMessageError`** — connect succeeds (`onConnected` fires), then the sign step throws. Manager rejects the connect promise with `WalletSignMessageError`.
  - **unexpected disconnect handled gracefully** — establishes a connected session, simulates the wallet emitting `standard:events change` with `accounts: []` (user disconnects from the extension's own UI). Subsequent `manager.signMessage` surfaces a `WalletNotConnectedError` via the adapter's `if (!account) throw` path — pins the design choice that the manager doesn't subscribe to adapter lifecycle events.

  Test infrastructure mirrors `mobile-connect-flow.test.ts` patterns where applicable. Wallet stub borrows the structure from `standard-wallet-adapter.test.ts`'s `makeFakeWallet` helper (StandardConnect / StandardDisconnect / SolanaSignMessage / SolanaSignIn / StandardEvents features, an `emitChange` controller for triggering the `change` listener). Wallet registry tracked via the same `trackRegistrations()` pattern used in `discovery.test.ts` so each test starts with a clean registry.

  Seams mocked: `navigator.userAgent` (Mac Chrome → `detectPlatform` resolves to `extension`), `window.solana` (truthy sentinel — `detectPlatform` only checks for presence), `localStorage` (real jsdom, cleared between tests).

  No source changes — pure test additions. Patch bump (absorbs into the existing core minor bump from prior changesets).

  Core test count: 336 (was 331; +5 desktop tests).
