# @monolithlabs-hub/wallet-connect-core

## 1.4.0

### Minor Changes

- d787377: Mobile fixes for Opindex and abandoned deep links.
  - **De-duplicate "X" vs "X Wallet".** `mergeWalletList` now matches a configured wallet against the Wallet Standard registry tolerant of a trailing "Wallet" word (new `normalizeWalletName`), so a configured `Opindex` merges with the registered `Opindex Wallet` into a single detected row instead of showing two. When detected, the row prefers the live registry icon and name.
  - **Recover from abandoned deep links.** Returning to the dapp after tapping a deep-link wallet without completing the connection no longer freezes the modal. The `WalletManager` listens for `visibilitychange`/`pageshow` and either resumes a genuine callback or resets the flow to `idle`; the `DeepLinkAdapter` gains `cancelPendingConnect()`.
  - **Install/open-only wallets.** `WalletConfig.universalLink` (and `deepLinkScheme`/`appStoreUrl`/`playStoreUrl`) are now optional; omitting `universalLink` marks a wallet as having no external mobile connect (e.g. Opindex, which only connects inside its own in-app browser). New fields: `installUrl` (mobile download/landing page — such a wallet routes there on a mobile browser) and `extensionUrl` (desktop browser-extension page, e.g. Chrome Web Store — opened in a new tab on desktop without the extension, falling back to `installUrl`). The `DeepLinkAdapter` gains `openInstall()`.

### Patch Changes

- b3b98c7: Pin a discovered-only Wallet Standard wallet (e.g. Opindex) to index 0. A wallet registered via Wallet Standard but absent from `WalletManagerConfig.wallets` previously showed the "Detected" badge yet sorted last on desktop; `getAugmentedPlatform()` now matches a discovered-only pin target by name slug, so it pins when `pinnedWallet` equals its slug.

## 1.3.0

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

## 1.1.0

### Minor Changes

- 0abf06b: Fix React StrictMode lifecycle bug where `WalletConnectProvider` and `useWallet(config)` threw `WalletManager has been destroyed` after the dev double-mount cycle.

  **Core**: adds `WalletManager.isDestroyed(): boolean` and relaxes the destroyed-state contract for observer methods. `subscribe()` returns a no-op unsubscribe and `initialize()` early-returns when called on a destroyed manager. Mutating methods (`connect`, `disconnect`, `signMessage`, `signIn`) continue to throw — a real call on a destroyed manager surfaces as a clear error.

  **React**: `WalletConnectProvider` and `useWallet(config)` (owned-manager path) now detect a destroyed manager inside their `useEffect` and rebuild via `setState`. The render after rebuild uses the fresh, live manager. Production-only consumers (no StrictMode) are unaffected.
