---
'@monolithlabs-hub/wallet-connect-core': patch
---

DeepLinkAdapter hardening (follow-up to TASK-108, in advance of TASK-109 consuming the adapter):

- **`startRedirect` reordered to build-then-save-then-mark-connecting.** A synchronous throw from `buildConnectUrl` / `buildSignAndConnectUrl` (bad `redirectUrl` / cluster / keypair-length) now rolls back cleanly: no pending state persisted, `isConnecting` never flips to `true`. Previously a partial write left orphaned state that survived for 10 minutes until the SessionStore staleness timer expired.
- **`resumeFromCallback` clears pending state on `parseCallback` failure.** Previously the decryption-failure path returned `null` without clearing, wedging the multi-tab scenario where a callback URL hits the wrong adapter and refresh re-runs the same failing decode.
- **`resumeFromCallback` pre-checks keypair field types** with `typeof === 'string'` before `bs58.decode`. Pre-TASK-108 `PendingState` records (no `ephemeralPublicKey` / `ephemeralSecretKey`) are detected and cleared without relying on the bs58 catch.
- **`disconnect()` only clears `sessionStorage` when `isConnected` or `isConnecting`.** A never-connected adapter calling `disconnect()` no longer wipes a sibling adapter's in-flight state (SessionStore is a module-level singleton; without this gate one stray `disconnect` would torpedo any other adapter on the same tab).
- **Empty `appStoreUrl` / `playStoreUrl` skip the Opindex fallback** and navigate directly to the deep link instead of scheduling a no-op-navigate-to-`""` after 1500ms.
- **`PendingState` JSDoc** now documents the pre-TASK-108 backwards-compat (older records detected and cleared automatically).

Tests added: state-not-persisted-on-build-throw; pending-state-cleared-on-decrypt-failure; pre-TASK-108 record auto-clear; cross-adapter session safety (A's pending state survives B's disconnect; A's own disconnect clears it); empty store URLs skip fallback.
