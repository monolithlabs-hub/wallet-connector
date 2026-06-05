# Opindex mobile deep-link connect protocol (spec for the wallet app)

> **Status:** spec for the Opindex wallet team, built in parallel with the
> library's docs/examples. The library side is already wired (the Opindex
> `WalletConfig` carries `universalLink: 'https://opindex.deeptap.io'`); this
> document is the wallet-app contract that makes that round-trip resolve.

## Why

Until the app honors this protocol, an Opindex deep-link tap on a mobile browser
opens `https://opindex.deeptap.io` but cannot complete a remote "connect" — the
library falls back to the install page after 1500ms. This spec defines what the
**Opindex mobile app** must implement so a dapp running in any mobile browser can
do the full round-trip: leave the page → approve in Opindex → return to the dapp
connected (optionally signed-in via SIWS) — the same flow Solflare and Phantom
support.

The library is already "Phantom-shaped." `packages/core/src/wallet-manager.ts`
routes purely on whether the wallet config has a `universalLink`:

- **absent** → `deepLinkAdapter.openInstall(...)` (old install/open-only behavior)
- **present** → `deepLinkAdapter.connect(...)` (the round-trip)

The Opindex config now carries `universalLink: 'https://opindex.deeptap.io'`, so
the only remaining work is in the wallet app.

## Two design decisions (locked)

1. **Wire-compat: mimic Phantom exactly.** Opindex uses the identical query-param
   names and JSON payload keys Phantom uses — _including_ the literal
   `phantom_encryption_public_key` callback param. This means **zero** changes to
   the library's parser/builder. The only oddity is Opindex emitting a
   `phantom_`-prefixed param; on the wire it's just a string.
2. **Parity target = Solflare, not Phantom.** Solflare _consumes_ the bundled
   `sign_in_message` and returns the signature in the **same** encrypted callback
   (one round-trip). Phantom ignores it (two prompts). **Opindex must do the
   Solflare thing** — see §4.

The contract below is derived directly from the library's existing code:

- Outbound URL builder: `packages/core/src/adapters/deep-link-builder.ts`
- Inbound callback parser: `packages/core/src/adapters/callback-handler.ts`
- Orchestration + store fallback: `packages/core/src/adapters/deep-link-adapter.ts`

---

## 1. Universal Link / App Link registration

- The deep-link target is `https://opindex.deeptap.io` — the **bare domain**,
  where the app's Apple App Site Association / Android assetlinks are **already
  configured**. The library appends the handshake query params to it, producing
  `https://opindex.deeptap.io?dapp_encryption_public_key=...`. This exact string
  is `WalletConfig.universalLink`.
- **iOS:** the `apple-app-site-association` on the domain must claim the path the
  connect request lands on (the domain root with a query string); the app needs
  the Associated Domains entitlement `applinks:opindex.deeptap.io`.
- **Android:** `assetlinks.json` (Digital Asset Links) + an App Link
  intent-filter for `https://opindex.deeptap.io`.
- Keep the custom scheme `opindexwallet://` (the config's `deepLinkScheme`)
  registered as an OS hand-off fallback.
- The page served at `https://opindex.deeptap.io` should also work as an HTML
  fallback ("Open in Opindex / Install Opindex") for users without the app — the
  library's Opindex-specific 1500ms store-fallback timer navigates here when the
  deep link isn't intercepted.
- **The app must distinguish a connect handshake from a plain landing visit** by
  the presence of the `dapp_encryption_public_key` query param: present → run the
  handshake below; absent → show the normal landing page.

## 2. Inbound connect request — params the app receives

The library appends these to `universalLink` (`buildBaseParams`,
`deep-link-builder.ts`). All values are `encodeURIComponent`-encoded.

| Param                        | Meaning                                            | Notes                                                   |
| ---------------------------- | -------------------------------------------------- | ------------------------------------------------------- |
| `dapp_encryption_public_key` | base58 of the dapp's 32-byte **x25519** public key | use for ECDH; also the connect-vs-landing discriminator |
| `cluster`                    | `mainnet-beta` or `devnet`                         | pick the RPC                                            |
| `app_url`                    | absolute https URL of the dapp                     | show in the consent prompt                              |
| `redirect_link`              | absolute https URL to return the user to           | append the result here                                  |
| `sign_in_message`            | (optional) SIWS message text to display + sign     | present only for sign-and-connect                       |

## 3. Crypto handshake (NaCl `box` — x25519 + XSalsa20-Poly1305)

The library decrypts with `nacl.box` (`callback-handler.ts`). The wallet
encrypts the mirror image:

1. Generate a fresh **x25519** keypair in the wallet (the response keypair).
2. `shared = box.before(dapp_encryption_public_key, wallet_secret_key)`.
3. Generate a random **24-byte** nonce.
4. `ciphertext = box.after(JSON.stringify(payload), nonce, shared)`.
5. base58-encode the wallet's response public key, the nonce, and the ciphertext
   for the callback URL.

## 4. SIWS bundling (the Solflare behavior — required)

When `sign_in_message` is present:

- Display the message and have the user sign it with their Solana (ed25519) key.
- The message may arrive with **no address line** — the library calls
  `signInMessage('')` on mobile because the public key isn't known when the link
  is built. Opindex should substitute the connecting account's own address per
  the SIWS spec's optional `address` field.
- Return the base58 signature as `signature` inside the **same** encrypted
  payload (one round-trip). Do **not** require a second redirect.

## 5. Encrypted response payload (JSON, before encryption)

The library validates this exact shape (`isPhantomCallbackPayload`,
`callback-handler.ts`). Keys must match exactly; types are strict.

```jsonc
{
  "public_key": "<base58 Solana address>", // required, non-empty string
  "session": "<opaque session token>", // required, non-empty string
  "signature": "<base58 ed25519 signature>", // optional; present iff sign_in_message was signed
}
```

- Extra keys are ignored, but if `signature` is present it **must** be a string
  or the whole parse is rejected.
- `session` is opaque to the library — it round-trips back to the wallet for
  later ops; Opindex defines its meaning.

## 6. Callback redirect — params the app sends back

Redirect the user agent to `redirect_link` with these three params appended
(`isCallbackUrl` / `parseCallback`, `callback-handler.ts`). **Exact names —
including the `phantom_`-prefixed one — per the wire-compat decision:**

| Param                           | Value                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| `phantom_encryption_public_key` | base58 of the wallet's 32-byte x25519 **response** public key |
| `nonce`                         | base58 of the 24-byte nonce                                   |
| `data`                          | base58 of the NaCl-box ciphertext from §3                     |

- **Preserve any other query params** already on `redirect_link`; the library
  strips only these three on success (`cleanCallbackParams`).
- The redirect must land on the **same origin** the dapp connected from — the
  dapp's ephemeral secret key lives in origin-scoped `sessionStorage`.

## 7. Error / rejection callback

On user rejection or wallet error, redirect back **without** the three success
params. (Phantom convention is `errorCode` / `errorMessage`.) The library
currently treats a non-success callback as "no callback" and resets the modal to
idle — so the minimum requirement is: don't emit `phantom_encryption_public_key`
/ `nonce` / `data` on failure.

## 8. Disconnect / post-connect signing (out of scope here)

The library's deep-link path is **connect (+ bundled SIWS) only**. Standalone
`signMessage` / `signIn` / `disconnect` are local-only on this path. Opindex does
**not** need disconnect or post-connect signing deep links to reach Solflare
parity _for this library_. Those endpoints are a later addition if full
Phantom-protocol parity is wanted for other dapps.

---

## Wire-format quick reference

```
Dapp → Opindex (the library builds this):
  https://opindex.deeptap.io
    ?dapp_encryption_public_key=<base58 x25519 pub>
    &cluster=mainnet-beta
    &app_url=https%3A%2F%2Fmyapp.example
    &redirect_link=https%3A%2F%2Fmyapp.example%2F
    &sign_in_message=<encoded SIWS text>        # only for sign-and-connect

Opindex → Dapp (the wallet must build this):
  https://myapp.example/
    ?phantom_encryption_public_key=<base58 wallet x25519 pub>
    &nonce=<base58 24-byte nonce>
    &data=<base58 NaCl box(ciphertext)>

Decrypted `data` (NaCl box, shared = x25519(dapp_pub, wallet_secret)):
  { "public_key": "...", "session": "...", "signature": "..."? }
```

## Verification

**Wallet side (Opindex app):**

- iOS Safari + Android Chrome: from a test dapp, tap Opindex → app opens →
  approve → land back connected. Repeat with `requireSignIn: true` → single
  round-trip, `signature` present.
- Confirm AASA / assetlinks resolve (Apple's CDN validator; `adb` App Links
  verification on Android).

**Library side (this repo):**

- `pnpm --filter @monolithlabs-hub/wallet-connect-core test`,
  `pnpm e2e`, and `pnpm turbo typecheck lint build test` stay green.
- Manual: run `examples/react-example` with mobile device emulation, tap Opindex,
  confirm a `https://opindex.deeptap.io?dapp_encryption_public_key=…` navigation.
