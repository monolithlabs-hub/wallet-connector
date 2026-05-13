---
'@monolithlabs/wallet-connect-core': minor
---

TASK-109 — add `createWalletManager(config)` to `@monolithlabs/wallet-connect-core`. This is the canonical public API of the core package — every other Phase 1 module (PlatformDetector, FlowMachine, SessionStore, getSortedWallets, StandardWalletAdapter + discovery, DeepLinkAdapter) wires together here.

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
