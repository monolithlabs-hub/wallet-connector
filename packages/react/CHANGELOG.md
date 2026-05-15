# @monolithlabs-hub/wallet-connect-react

## 1.0.1

### Patch Changes

- 0abf06b: Fix React StrictMode lifecycle bug where `WalletConnectProvider` and `useWallet(config)` threw `WalletManager has been destroyed` after the dev double-mount cycle.

  **Core**: adds `WalletManager.isDestroyed(): boolean` and relaxes the destroyed-state contract for observer methods. `subscribe()` returns a no-op unsubscribe and `initialize()` early-returns when called on a destroyed manager. Mutating methods (`connect`, `disconnect`, `signMessage`, `signIn`) continue to throw — a real call on a destroyed manager surfaces as a clear error.

  **React**: `WalletConnectProvider` and `useWallet(config)` (owned-manager path) now detect a destroyed manager inside their `useEffect` and rebuild via `setState`. The render after rebuild uses the fresh, live manager. Production-only consumers (no StrictMode) are unaffected.

- Updated dependencies [0abf06b]
  - @monolithlabs-hub/wallet-connect-core@1.1.0
