# @monolithlabs-hub/wallet-connect-vue

## 1.2.1

### Patch Changes

- 5ff6ef4: Track wallet-side account switches and disconnects on the extension path.

  Previously the `WalletManager` ignored the adapter's lifecycle events: after the
  user switched accounts in the extension, `getContext().publicKey` (and
  `useWallet().publicKey`) kept reporting the old account while the adapter signed
  with the new one — transactions built for account A were sent to a wallet on
  account B and rejected.
  - core: the manager subscribes to the active adapter while a session is live. An
    account switch is treated as a new connection (publicKey updated, old SIWS
    signature dropped, `onConnected` re-fires, `requireSignIn` flows land in
    `'connected'`); a wallet-side disconnect resets to `'idle'`. New config
    callbacks `onAccountChanged(publicKey, previousPublicKey)` and
    `onWalletDisconnected()`. Subscriptions are released on `disconnect()`,
    re-`connect()` and `destroy()`.
  - core: signing methods throw `WalletAccountError` if the wallet's current
    account differs from the session's publicKey.
  - core: `StandardWalletAdapter.signIn` emits `'accountsChange'` when the wallet
    answers with a different account than the connected one.
  - react / vue: `<ConnectButton>` fires `onConnected` / emits `connected` again
    on an account switch (the state alone can read `authenticated → authenticated`).

- Updated dependencies [5ff6ef4]
  - @monolithlabs-hub/wallet-connect-core@1.5.0

## 1.1.1

### Patch Changes

- Updated dependencies [d787377]
- Updated dependencies [b3b98c7]
  - @monolithlabs-hub/wallet-connect-core@1.4.0

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
