# @monolithlabs-hub/wallet-connect-react

## 1.1.0

### Minor Changes

- b1985bd: Add `signTransaction` and `signAndSendTransaction` to the extension path.

  `WalletManager`, the React `useWallet` hook, and the Vue `useWallet` composable now
  expose `signTransaction(transaction, chain?)` and `signAndSendTransaction(transaction,
options?)`, delegating to the connected wallet's `solana:signTransaction` /
  `solana:signAndSendTransaction` Wallet-Standard features. The chain defaults to the
  configured cluster (`mainnet-beta → solana:mainnet`, `devnet → solana:devnet`). Both
  throw `WalletNotReadyError` on the mobile deep-link path and for wallets that don't
  expose the corresponding feature, `WalletNotConnectedError` when no wallet is connected,
  and `WalletSignTransactionError` / `WalletSendTransactionError` on wallet rejection.

### Patch Changes

- Updated dependencies [b1985bd]
  - @monolithlabs-hub/wallet-connect-core@1.3.0

## 1.0.1

### Patch Changes

- 0abf06b: Fix React StrictMode lifecycle bug where `WalletConnectProvider` and `useWallet(config)` threw `WalletManager has been destroyed` after the dev double-mount cycle.

  **Core**: adds `WalletManager.isDestroyed(): boolean` and relaxes the destroyed-state contract for observer methods. `subscribe()` returns a no-op unsubscribe and `initialize()` early-returns when called on a destroyed manager. Mutating methods (`connect`, `disconnect`, `signMessage`, `signIn`) continue to throw — a real call on a destroyed manager surfaces as a clear error.

  **React**: `WalletConnectProvider` and `useWallet(config)` (owned-manager path) now detect a destroyed manager inside their `useEffect` and rebuild via `setState`. The render after rebuild uses the fresh, live manager. Production-only consumers (no StrictMode) are unaffected.

- Updated dependencies [0abf06b]
  - @monolithlabs-hub/wallet-connect-core@1.1.0
