---
'@monolithlabs/wallet-connect-core': minor
---

TASK-106 — add the CallbackHandler to `@monolithlabs/wallet-connect-core`. Exports `isCallbackUrl`, `parseCallback`, `extractCallbackFromCurrentUrl`, plus the `CallbackResult` type. Decrypts the wallet's redirect-callback payload (Phantom's encrypted format: `phantom_encryption_public_key` + `nonce` + `data` query params, base58-encoded) using the dapp's ephemeral secret key via `nacl.box.open` (x25519 ECDH + XSalsa20-Poly1305).

- `isCallbackUrl(url)` is a cheap structural check (presence of the three params) — does not attempt decryption.
- `parseCallback(url, ephemeralKeypair)` is pure and total: returns `null` for any malformed input (missing params, base58 errors, wrong-size key/nonce, decryption failure, invalid or wrong-shape JSON), never throws.
- `extractCallbackFromCurrentUrl(ephemeralKeypair)` is a convenience that reads `window.location.href` and on a successful parse strips the three callback params (plus `errorCode`/`errorMessage`) via `history.replaceState` so a navigation-and-back doesn't re-process. SSR-safe (returns `null` when `window` is undefined). On a failed parse, the URL is **not** modified — matches the PLAN.md acceptance criterion literally; the caller surfaces an error in its UI.

Two intentional spec deviations (documented in CLAUDE.md):

1. `extractCallbackFromCurrentUrl` takes `ephemeralKeypair` as a parameter. PLAN.md's signature is `(): CallbackResult | null` but the dapp's secret key has to come from somewhere; `SessionStore` (TASK-103) doesn't yet support persisting keypairs (that's a TASK-108 concern). The caller — `WalletManager` — loads the keypair from PendingState and passes it in.
2. Error callbacks (Phantom redirects with `errorCode` / `errorMessage` on user rejection) are out of scope for the `CallbackResult` shape. `isCallbackUrl` returns `false` and `parseCallback` returns `null` for them, so the caller treats an error redirect as "no callback" and surfaces its own error via the `WalletManager`'s `onError` handler.
