---
'@monolithlabs-hub/wallet-connect-core': minor
---

Mobile fixes for Opindex and abandoned deep links.

- **De-duplicate "X" vs "X Wallet".** `mergeWalletList` now matches a configured wallet against the Wallet Standard registry tolerant of a trailing "Wallet" word (new `normalizeWalletName`), so a configured `Opindex` merges with the registered `Opindex Wallet` into a single detected row instead of showing two. When detected, the row prefers the live registry icon and name.
- **Recover from abandoned deep links.** Returning to the dapp after tapping a deep-link wallet without completing the connection no longer freezes the modal. The `WalletManager` listens for `visibilitychange`/`pageshow` and either resumes a genuine callback or resets the flow to `idle`; the `DeepLinkAdapter` gains `cancelPendingConnect()`.
- **Install/open-only wallets.** `WalletConfig.universalLink` (and `deepLinkScheme`/`appStoreUrl`/`playStoreUrl`) are now optional; omitting `universalLink` marks a wallet as having no external mobile connect (e.g. Opindex, which only connects inside its own in-app browser). New fields: `installUrl` (mobile download/landing page — such a wallet routes there on a mobile browser) and `extensionUrl` (desktop browser-extension page, e.g. Chrome Web Store — opened in a new tab on desktop without the extension, falling back to `installUrl`). The `DeepLinkAdapter` gains `openInstall()`.
