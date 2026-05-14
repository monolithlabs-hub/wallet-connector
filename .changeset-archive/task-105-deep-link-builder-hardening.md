---
'@monolithlabs-hub/wallet-connect-core': patch
---

DeepLinkBuilder hardening (follow-up to TASK-105, in advance of TASK-106 / TASK-108 consuming the module):

- `assertAbsoluteUrl` no longer relies on a string-match (`err.message.includes('must use')`) to decide whether to rethrow the protocol-mismatch error vs. replace it with the absolute-URL error. The two branches are explicit now and robust to future URL-constructor error-message changes.
- `buildBaseParams` runtime-validates `cluster` (must be `'mainnet-beta'` or `'devnet'`) and `ephemeralKeypair.publicKey.length` (must be 32 bytes). Catches caller mis-wiring at the URL build site instead of letting a malformed URL fail silently inside TASK-108's callback path.
- Switched URL encoding from `URLSearchParams.toString()` (form-urlencoded: spaces → `+`) to explicit `encodeURIComponent`-per-value joining (RFC-3986 percent encoding: spaces → `%20`). New test pins the choice. No observable change for non-space characters — `&`, `=`, `?`, `/`, `:` all encode identically.
- `appendParams` handles a `universalLink` that ends with a bare `?` (no double separator).
- `buildSignAndConnectUrl` JSDoc now carries an `@experimental` tag with the forward-compat caveat about Phantom's `/ul/v1/connect` endpoint not currently consuming `sign_in_message`.
- `EphemeralKeypair.secretKey` JSDoc forward-links to the SessionStore persistence pattern that TASK-106 / TASK-108 will wire up.

Tests added: `%20`-not-`+` for spaces; trailing-`?` `universalLink`; invalid-cluster throw; wrong-length publicKey throw; "secretKey never appears in URL" security invariant; base58 round-trip on the generated public key.
