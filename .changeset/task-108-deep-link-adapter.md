---
'@monolithlabs/wallet-connect-core': minor
---

TASK-108 — add `DeepLinkAdapter` to `@monolithlabs/wallet-connect-core`. Mobile-flow orchestrator that ties together TASK-105 (DeepLinkBuilder), TASK-106 (CallbackHandler), and TASK-103 (SessionStore). Exports `createDeepLinkAdapter(options)` + 6 types (`DeepLinkAdapter`, `DeepLinkAdapterEvent`, `DeepLinkAdapterListener`, `DeepLinkAdapterOptions`, `DeepLinkAdapterUnsubscribe`, `DeepLinkConnectInput`).

`connect(input)` generates a fresh ephemeral x25519 keypair, persists state via the SessionStore, navigates the page to the wallet's universal link (`buildSignAndConnectUrl` when `requireSignIn: true`, plain `buildConnectUrl` otherwise), and returns a promise that **never resolves on this page load** — the next page must call `resumeFromCallback()`.

`resumeFromCallback()` reads `window.location.href`, finds the saved `PendingState`, decodes the keypair, calls `parseCallback` from TASK-106, clears the pending state, remembers the wallet via `saveLastUsedWallet`, and emits `'connect'`. Returns `null` for: no pending state, no callback URL, wrong-shape pending keypair, decryption failure.

**Opindex App Store / Play Store fallback**: when `wallet.id === 'opindex'` and the UA is mobile, a 1500ms timer fires; if the page is still visible, navigate to `wallet.appStoreUrl` (iOS) or `wallet.playStoreUrl` (Android). The timer is cancelled by a `visibilitychange` to hidden (OS opened the wallet app). Both `navigate` and `scheduleFallback` are injectable for testing.

**Idempotency**: concurrent `connect()` calls share one inflight promise + one navigation. Sync validation errors (`requireSignIn: true` with no `signInMessage`) throw before the inflight slot is set, so subsequent calls aren't wedged.

**Out of scope**: standalone `signMessage` / `signIn` throw `WalletNotReadyError`. Bundled SIWS via `requireSignIn: true` is the only signing path. Standalone post-connect signing would require a second redirect round-trip with per-wallet signMessage URL building.

**Schema change**: `PendingState` extended with `ephemeralPublicKey: string` and `ephemeralSecretKey: string` (both base58); `createPendingState` input shape changed accordingly. The `PendingState.nonce` (UUID v4 replay nonce) is distinct from Phantom's callback URL `nonce` (XSalsa20 IV) — both nonces, different roles; documented inline.
