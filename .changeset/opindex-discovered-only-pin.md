---
'@monolithlabs-hub/wallet-connect-core': patch
---

Pin a discovered-only Wallet Standard wallet (e.g. Opindex) to index 0. A wallet registered via Wallet Standard but absent from `WalletManagerConfig.wallets` previously showed the "Detected" badge yet sorted last on desktop; `getAugmentedPlatform()` now matches a discovered-only pin target by name slug, so it pins when `pinnedWallet` equals its slug.
