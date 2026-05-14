# Mobile flow

How the deep-link round-trip works, what your dapp has to configure, and how Sign-In With Solana is bundled into the connect step.

## The shape of the problem

Mobile Solana wallets aren't browser extensions. Phantom on iOS is an app; the user has to leave Safari to approve a connection. The library handles this transparently — your component code looks identical to the desktop flow — but it's worth understanding the round-trip because it influences a few configuration choices.

```
   ┌──────────────────┐         ┌──────────────────┐         ┌──────────────────┐
   │  Your dapp       │         │  iOS / Android   │         │  Your dapp       │
   │  (Safari)        │  click  │  Phantom app     │approve  │  (Safari, again) │
   │                  │ ─────▶  │                  │ ─────▶  │                  │
   │  manager.connect │         │  user approves   │         │  manager.        │
   │  navigates away  │         │  + signs SIWS    │         │    initialize()  │
   └──────────────────┘         └──────────────────┘         └──────────────────┘
       page 1 (gone)                 (out-of-page)              page 2 (resumed)
```

Two key implications:

1. **The connect promise does NOT resolve on the calling page.** `await manager.connect('phantom')` on mobile navigates the tab away; control returns on the next page load.
2. **State must survive a redirect.** The library serializes the in-flight flow to `sessionStorage` before navigating away and resumes it from the URL parameters on the return leg.

If you're using `<WalletConnectProvider>` (React) or `WalletConnectPlugin` (Vue) you don't have to do anything for resume — the Provider/Plugin calls `manager.initialize()` on mount. If you're wiring a `WalletManager` manually, call `initialize()` yourself on page load.

## Strategy detection

`detectPlatform()` decides the strategy from `navigator.userAgent` and `window`:

| Condition                                                  | Strategy           |
| ---------------------------------------------------------- | ------------------ |
| `window.solana` is truthy (any wallet has injected itself) | `'extension'`      |
| Mobile UA without `window.solana`                          | `'deeplink'`       |
| Desktop UA without any extension                           | `'install-prompt'` |

A mobile UA _with_ `window.solana` resolves to `'extension'` — this is the Phantom in-app browser case, where Phantom's own webview injects the wallet and the deep-link path would be the wrong choice.

The manager picks the matching adapter automatically:

- `'extension'` → `StandardWalletAdapter` over the Wallet Standard registry. Connect resolves on the same page load.
- `'deeplink'` → `DeepLinkAdapter`. Connect navigates away; resolves on the next page load via `initialize()`.
- `'install-prompt'` → no adapter. The user can't connect; they see the "Install" badge on the pinned wallet.

## The deep-link URL

For the `'deeplink'` strategy, `manager.connect(walletId)` does roughly this:

1. Generate a fresh ephemeral x25519 keypair via `crypto.getRandomValues`.
2. Persist `{ nonce, walletId, ephemeralPublicKey, ephemeralSecretKey, redirectUrl, ts }` to `sessionStorage`.
3. Build the universal link, including `dapp_encryption_public_key` (base58), `cluster`, `app_url`, and `redirect_link`.
4. Set `window.location.href` to that URL.

On the wallet side: the user approves, the wallet encrypts the response with the dapp's ephemeral public key, and redirects the user back to `redirect_link` with `phantom_encryption_public_key`, `nonce`, and `data` query parameters.

On return:

1. `initialize()` reads the URL parameters.
2. If they look like a callback, it loads the matching `PendingState` from `sessionStorage`.
3. It decrypts the payload with `nacl.box.open` (x25519 ECDH + XSalsa20-Poly1305).
4. It strips the callback params from the URL via `history.replaceState` (so a refresh doesn't try to re-resume the same callback).
5. It advances the FlowMachine through `WALLET_CONNECTED` (and `SIGN_COMPLETED` if SIWS was bundled).

The decryption + URL-strip code is in `packages/core/src/adapters/callback-handler.ts` if you want to read the source.

## Callback URL contract

The mobile wallet redirects to `<appUrl><callbackPath>?phantom_encryption_public_key=…&nonce=…&data=…`. You have two knobs:

```ts
{
  appUrl: 'https://myapp.example', // default: window.location.origin
  callbackPath: '/wallet/callback', // default: window.location.pathname
}
```

The callback page must:

- Load your dapp (so the manager exists and `initialize()` runs).
- Live on the **same origin** as the page that called `connect()` — `sessionStorage` is origin-scoped.

You don't need a dedicated callback route. If you leave `callbackPath` at the default, the wallet redirects back to whatever page started the connect — most apps' single-page architecture handles this transparently.

If you DO use a dedicated route, make sure it mounts the same Provider/Plugin (so `initialize()` runs) and either renders the same `<ConnectButton>` or redirects to your main page after the flow settles.

## SIWS bundling

Setting `requireSignIn: true` on desktop produces two sequential prompts (connect + sign). On mobile that would mean two round-trips. The library avoids the second round-trip by **bundling the SIWS message into the connect deep link**:

```
   .../ul/v1/connect?
     dapp_encryption_public_key=...
     &cluster=mainnet-beta
     &app_url=https://myapp.example
     &redirect_link=https://myapp.example/
     &sign_in_message=<encoded SIWS message>
```

The wallet returns the signature in the same encrypted callback payload as the connect result. `manager.initialize()` decodes both at once and the FlowMachine auto-steps `connected → signing → authenticated` in a single transition.

This is why `signInMessage` is called with `''` on mobile: the public key isn't known yet when the deep link is built. The wallet substitutes its own address per the SIWS spec's optional `address` field. Handle the empty-arg case in your `signInMessage` function:

```ts
signInMessage: (publicKey) =>
  publicKey === ''
    ? 'Sign in to MyApp.'
    : `Sign in to MyApp as ${publicKey}.`,
```

Phantom currently ignores the `sign_in_message` parameter — bundled SIWS is forward-compatible with Phantom but only kicks in for wallets that adopt the bundled-SIWS extension. Solflare and Backpack support it.

## What you actually have to do

For a typical SPA:

1. Pass a `wallets[]` config to `<WalletConnectProvider>` (React) or `app.use(WalletConnectPlugin, ...)` (Vue).
2. Make sure your dev server origin and production origin both match `appUrl` (so `sessionStorage` survives).
3. That's it.

For an MPA or a dedicated callback route:

1. Set `callbackPath` to your callback route.
2. Make sure that route mounts the same Provider/Plugin with the same config.
3. The Provider/Plugin's `initialize()` call will detect the callback and resume.

For a fully custom integration that doesn't use the React/Vue layers:

1. Build a `WalletManager` via `createWalletManager(config)`.
2. Call `manager.initialize()` on page load.
3. Wire `manager.subscribe(state => …)` to your own UI.
4. Call `manager.connect(walletId)` from your picker.

See `packages/core/src/wallet-manager.ts` for the full `WalletManager` interface.

## Common gotchas

- **`localhost:5173` (dev) and `https://myapp.example` (prod) are different origins.** A pending state saved on dev won't be found on prod. This is rarely a problem in practice because you only call `connect()` after the page loads on a specific origin, but be aware of it.
- **Pending state is short-lived.** The library treats `PendingState` older than 10 minutes as expired and discards it. If your user pauses for ages between leaving the page and returning, they'll see the modal reset.
- **`window.opindex` is a legacy escape hatch, not the canonical detection path.** Real Opindex registers via Wallet Standard. The window sentinel still flips `platform.hasOpindexExtension` for backward compat, which suppresses the "Install" badge on the Opindex row. See [opindex.md](./opindex.md).
- **The connect promise never resolves on the mobile calling page.** Don't write code like `await manager.connect('phantom'); doNextThing()` — `doNextThing` lives on the _return_ page. Use `onConnected` / `onAuthenticated` / `subscribe()` instead.

## Where to look in the source

- `packages/core/src/platform/detector.ts` — UA / window sniffing, strategy decision.
- `packages/core/src/adapters/deep-link-builder.ts` — URL construction + ephemeral keypair.
- `packages/core/src/adapters/deep-link-adapter.ts` — orchestrates the navigate + store-fallback timer.
- `packages/core/src/adapters/callback-handler.ts` — return-leg parsing + decryption.
- `packages/core/src/session/store.ts` — `PendingState` (sessionStorage) + `lastUsedWallet` (localStorage).
