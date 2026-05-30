# @monolithlabs-hub/wallet-connect-vue

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

- Updated dependencies [0abf06b]
  - @monolithlabs-hub/wallet-connect-core@1.1.0
