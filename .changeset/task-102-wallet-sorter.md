---
'@monolithlabs/wallet-connect-core': minor
---

TASK-102 — add `getSortedWallets(wallets, platform)` and the `WalletConfig` type to `@monolithlabs/wallet-connect-core`. Pins Opindex (`id === 'opindex'`) at index 0 on mobile unconditionally, and on desktop only when `platform.hasOpindexExtension` is true. After the pin, elevates the wallet matching `localStorage['lastUsedWallet']`. Remaining wallets are sorted ascending by `priority` (stable sort preserves input order on ties). Pure — never mutates the input array. SSR-safe — falls back to no last-used wallet when `localStorage` is unavailable or throws. `WalletConfig` carries an optional `standardName?: WalletName` field for forward compatibility with the Wallet-Standard adapter (TASK-107).
