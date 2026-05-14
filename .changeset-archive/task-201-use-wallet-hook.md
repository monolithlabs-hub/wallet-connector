---
'@monolithlabs-hub/wallet-connect-react': minor
'@monolithlabs-hub/wallet-connect-core': minor
---

TASK-201 — add the `useWallet()` React hook to `@monolithlabs-hub/wallet-connect-react`.

**React side**:

- `useWallet(config?: WalletManagerConfig): UseWalletReturn` — primary public hook. Subscribes to a shared `WalletManager` via `useSyncExternalStore` (handles concurrent rendering and StrictMode automatically).
- `WalletConnectContext` — internal `React.Context<WalletManager | null>` exported so the upcoming `<WalletConnectProvider>` (TASK-202) and integration tests can supply a manager. End-users should prefer the Provider once it lands.
- Return shape mirrors `@solana/wallet-adapter-react`'s `WalletContextState` where the fields overlap (`wallet`, `publicKey`, `connecting`, `connected`, `disconnecting`, `select`, `connect`, `disconnect`, `signMessage`, `signIn`), with this library's additions on top (`state`, `sortedWallets`, `isConnecting` / `isConnected` / `isSigning` / `isAuthenticated`, `error`). Consumers migrating from wallet-adapter-react change their import path; runtime semantics match.
- `wallet` is this library's `WalletConfig` (display metadata), not wallet-adapter's `Wallet` adapter wrapper — same field name, slightly different shape.
- Behavior: `manager.initialize()` runs once per manager identity in a `useEffect`. `select(walletId)` stores a pre-connect selection; `connect()` uses it (or the FlowMachine's current `walletId`). `disconnect()` toggles a local `disconnecting` flag around the manager call — the FlowMachine collapses disconnect into a sync `RESET`, so there's no observable state for it otherwise.
- Two entry points: `useWallet(config)` self-owns a manager scoped to the component and destroys it on unmount; `useWallet()` reads from the Provider context (throws a descriptive error if neither is available). Inline `{...}` configs will recreate the manager every render — memoize at the call site or use the Provider.

**Core side** (small extension in service of TASK-201's compat shape):

- `WalletManager` now exposes `signMessage(message)` and `signIn(input?)`. They delegate to the active `StandardWalletAdapter` on the extension / in-app-browser path. On the mobile deep-link path they throw `WalletNotReadyError` — mobile uses bundled SIWS via `requireSignIn: true`, not standalone post-connect signs. Throws `WalletNotConnectedError` if no wallet is connected, and after `destroy()`.
- `SolanaSignInInput` / `SolanaSignInOutput` are now re-exported from `@monolithlabs-hub/wallet-connect-core`'s types barrel. Downstream packages typing against `WalletManager.signIn` no longer need to add `@solana/wallet-standard-features` as a direct dependency.
