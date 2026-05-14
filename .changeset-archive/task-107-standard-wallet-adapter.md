---
'@monolithlabs-hub/wallet-connect-core': minor
---

TASK-107 — port `StandardWalletAdapter` + add `discoverStandardWallets` to `@monolithlabs-hub/wallet-connect-core`. Adapts any Wallet-Standard wallet (Phantom, Solflare, Backpack, Glow, …) to a single async surface: `connect`, `disconnect`, `signMessage`, `signIn`, `subscribe`, `destroy`. `subscribe` emits `'connect' | 'disconnect' | 'accountsChange'` events derived from the wallet's `standard:events` `change` feed.

- `connect()` resolves with the first authorized account's base58 public key; rejects with `WalletConnectionError` on user cancel or empty account list.
- `signMessage(bytes)` resolves with the signature `Uint8Array`; rejects with `WalletSignMessageError` on cancel, `WalletNotReadyError` when `solana:signMessage` is missing, `WalletNotConnectedError` when no account is selected.
- `signIn(input?)` resolves with `SolanaSignInOutput`; rejects with `WalletNotReadyError` when `solana:signIn` is missing, `WalletSignInError` on cancel. Marks the adapter connected on success (signIn implies connect).
- `disconnect()` calls `standard:disconnect` when available, always clears local state, rejects with `WalletDisconnectionError` if the wallet throws.

`discoverStandardWallets()` returns a `DiscoveryHandle` over the live `@wallet-standard/app` registry: `getAdapters()`, `subscribe(listener)`, `destroy()`. Seeds with pre-registered wallets, listens to both `register` and `unregister` events, caches one adapter per Wallet object (no duplicates on re-registration), and destroys adapters on unregister. Filter (`isCompatibleStandardWallet`): `standard:connect` + at least one `solana:*` chain — intentionally looser than upstream (no transaction-feature requirement) since this library doesn't handle transactions; the dapp goes through `@wallet-standard/app` directly for those.

Ported under Apache-2.0 from `@solana/wallet-standard-wallet-adapter-base`. Both files carry a file-level attribution header; `THIRD_PARTY_LICENSES.md` lists their upstream paths.
