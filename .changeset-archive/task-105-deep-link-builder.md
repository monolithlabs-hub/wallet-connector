---
'@monolithlabs-hub/wallet-connect-core': minor
---

TASK-105 — add the DeepLinkBuilder to `@monolithlabs-hub/wallet-connect-core`. Exports `buildConnectUrl(wallet, options)`, `buildSignAndConnectUrl(wallet, options)`, `generateEphemeralKeypair()`, plus the `EphemeralKeypair`, `ConnectOptions`, `SignConnectOptions`, and `SolanaCluster` types.

URLs follow Phantom's Universal Link API spec (Solflare and Opindex use the same parameter shape): `<wallet.universalLink>?dapp_encryption_public_key=<base58>&cluster=...&app_url=...&redirect_link=...`. `redirect_link` and `app_url` are validated as absolute http(s) URLs and throw with descriptive messages on relative inputs or non-http(s) schemes (defense against `javascript:` injection). All parameter values are percent-encoded via `URLSearchParams`; an existing `?` in `universalLink` is detected and the new params are joined with `&`.

Ephemeral x25519 keypairs are generated via `tweetnacl.box.keyPair()`, which seeds from `crypto.getRandomValues` (browser) / Node's `crypto` (server) — never `Math.random`. Each `generateEphemeralKeypair()` call returns a fresh pair; `secretKey` must be persisted by the caller (e.g., via `SessionStore`) so the redirect callback can decrypt the wallet's response on the next page load.

`buildSignAndConnectUrl` adds a `sign_in_message` query param to the connect URL (forward-compatible: Phantom's `/ul/v1/connect` endpoint does not currently accept this, so combined SIWS at the URL level is a no-op there. The `DeepLinkAdapter` (TASK-108) handles the two-redirect fallback for wallets that don't support a combined endpoint).

Runtime deps added to `core`: `tweetnacl@^1.0.3`, `bs58@^6.0.0`.
