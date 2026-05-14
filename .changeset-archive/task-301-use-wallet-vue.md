---
'@monolithlabs-hub/wallet-connect-vue': minor
---

TASK-301 — add the `useWallet()` Vue 3 composable.

`packages/vue/src/composables/use-wallet.ts` exports `useWallet()` plus the `UseWalletReturn` type. Reads the `WalletManager` from `WalletConnectInjectionKey` (TASK-302's `<WalletConnectPlugin>` will `app.provide()` it); throws "must be used inside an app that installs WalletConnectPlugin" if no injection is present.

Reactivity is bridged by two source-of-truth refs (`ref<FlowState>` for state, `shallowRef<FlowContext>` for context) updated by a single `manager.subscribe` callback. The public surface is derived via `computed`: `publicKey`, `signature`, `wallet`, `sortedWallets`, `error`, `isConnecting` / `isConnected` / `isSigning` / `isAuthenticated`, plus the `connecting` / `connected` aliases. Methods: `select`, `connect(walletId?)`, `disconnect`, `signMessage`, `signIn` — all matching the React hook's polished surface (including the same-handler-safe `select() + connect()` pattern via a non-reactive sync slot).

**Lifecycle**: subscribes in `setup()` on the client only (gated by `typeof window !== 'undefined'` for SSR-safety); calls `manager.initialize()` in `onMounted`; unsubscribes in `onUnmounted`. Refreshes refs after `initialize()` to belt-and-suspenders against the (vanishingly rare) case where the initialize finishes between subscribe-setup and the first `notify`.

Companion exports: `WalletConnectInjectionKey` (the `InjectionKey<WalletManager>` symbol) and `useWalletContext()` (the lower-level escape hatch that returns the raw manager, mirroring the React package).

New devDeps: `vue@^3.5.34`, `@vue/test-utils@^2.4.10`.

15 composable tests covering all 5 PLAN.md cases (idle on mount, initialize on mount, reactive template re-render, connect with walletId, isConnected computed, unsubscribe on unmount) plus 9 extras (same-handler select+connect regression, error reactive, signature exposure, disconnect toggling, signMessage/signIn delegation, throw without Plugin). Composable file at 100% line coverage.
