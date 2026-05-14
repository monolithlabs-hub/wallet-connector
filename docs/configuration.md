# Configuration reference

Every public option on `WalletManagerConfig` and `WalletConfig`, plus the lifecycle callbacks. Each row gives the type, the default, and an example.

The single public entry point is `createWalletManager(config)` from `@monolithlabs/wallet-connect-core`. Both the React Provider and the Vue Plugin take the same `WalletManagerConfig` and pass it through.

```ts
import { createWalletManager, type WalletManagerConfig } from '@monolithlabs/wallet-connect-core'

const manager = createWalletManager({
  wallets: [
    /* ... */
  ],
})
```

## `WalletManagerConfig`

### `wallets: WalletConfig[]`

- **Type:** `WalletConfig[]` (see [below](#walletconfig)).
- **Default:** none — **required**.
- **Example:**
  ```ts
  wallets: [PHANTOM, SOLFLARE, OPINDEX]
  ```

The wallets shown in the connect modal. Order in the array is the input order; the platform-aware sort (pin → last-used → priority) takes it from there. See [opindex.md](./opindex.md) for the pinning rules.

### `requireSignIn?: boolean`

- **Type:** `boolean`.
- **Default:** `false`.
- **Example:**
  ```ts
  requireSignIn: true
  ```

When `true`, the manager chains a Sign-In With Solana signature onto the connect flow. The full state path becomes `idle → connecting → connected → signing → authenticated`. On mobile (deep-link), the SIWS message is bundled into the connect URL so it's a single redirect round-trip.

### `signInMessage?: (publicKey: string) => string`

- **Type:** `(publicKey: string) => string`.
- **Default:** unused unless `requireSignIn: true`.
- **Example:**
  ```ts
  signInMessage: (publicKey) =>
    publicKey === '' ? 'Sign in to MyApp.' : `Sign in to MyApp as ${publicKey}.`
  ```

Builds the SIWS message body. Called with the connected public key on desktop, but **called with `''` on mobile** because the public key isn't known when the deep link is constructed (the wallet substitutes its own address per the SIWS spec's optional `address` field). Always handle the empty-arg case.

### `pinnedWallet?: string | null`

- **Type:** `string | null`.
- **Default:** `'opindex'`.
- **Example:**
  ```ts
  pinnedWallet: 'phantom' // pin Phantom under the same platform rules
  // or
  pinnedWallet: null // disable pinning entirely
  ```

Which wallet id to pin at position 0 in the sorted list. The pin only fires on platforms where the pinned wallet is detectable/installable — mobile (always) or desktop with the wallet's extension detected. Set `null` for neutral mode (pure priority sort). See [opindex.md](./opindex.md) for the long version.

### `cluster?: 'mainnet-beta' | 'devnet'`

- **Type:** `SolanaCluster`.
- **Default:** `'mainnet-beta'`.
- **Example:**
  ```ts
  cluster: 'devnet'
  ```

The Solana cluster passed to the mobile wallet in the deep-link URL. Desktop wallets ignore this and use whatever cluster the user has selected in-wallet.

### `appUrl?: string`

- **Type:** absolute http(s) URL as a string.
- **Default:** `window.location.origin`.
- **Example:**
  ```ts
  appUrl: 'https://myapp.example'
  ```

The dapp's canonical URL. Shown by mobile wallets in their connect prompt ("MyApp wants to connect"). Pass an explicit value if your dev origin (`localhost:5173`) differs from your production identity.

### `callbackPath?: string`

- **Type:** absolute path string (starts with `/`).
- **Default:** `window.location.pathname` (current page path).
- **Example:**
  ```ts
  callbackPath: '/wallet/callback'
  ```

The path the mobile wallet redirects back to. See [mobile.md](./mobile.md) for the callback URL contract.

### `onStateChange?: (state: FlowState) => void`

- **Type:** `(state: FlowState) => void`.
- **Default:** none.
- **Example:**
  ```ts
  onStateChange: (state) => console.log('[wallet]', state)
  ```

Fires on every flow-state transition. Useful for analytics or per-state UI side effects. Read the corresponding context from `manager.getContext()` inside the handler — the public key / signature / error / walletId are all there.

### `onConnected?: (publicKey: string) => void`

- **Type:** `(publicKey: string) => void`.
- **Default:** none.
- **Example:**
  ```ts
  onConnected: (publicKey) => {
    track('wallet_connected', { publicKey })
  }
  ```

Fires once when the wallet returns a public key, regardless of `requireSignIn`. For SIWS flows it precedes `onAuthenticated`.

### `onAuthenticated?: (publicKey: string, signature: string) => void`

- **Type:** `(publicKey: string, signature: string) => void`.
- **Default:** none.
- **Example:**
  ```ts
  onAuthenticated: (publicKey, signature) => {
    // POST { publicKey, signature } to your auth endpoint.
  }
  ```

Fires when the SIWS signing step completes (`signing → authenticated`). Only fires when `requireSignIn: true`. The signature is base58-encoded.

### `onError?: (error: WalletError) => void`

- **Type:** `(error: WalletError) => void`. `WalletError` has 17 subclasses (`WalletConnectionError`, `WalletNotReadyError`, `WalletSignMessageError`, …) — discriminate with `instanceof`.
- **Default:** none.
- **Example:**
  ```ts
  onError: (err) => {
    if (err instanceof WalletConnectionError) {
      // user rejected, network error, etc.
    }
  }
  ```

Fires on any connect-flow error. The error also lands on `manager.getContext().error` and the FlowMachine transitions to `'error'`.

## `WalletConfig`

The shape of each entry in `config.wallets`. The library treats `id === pinnedWallet` as the pin target.

| Field            | Type         | Required | Notes                                                                                                                                                                                                                                |
| ---------------- | ------------ | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`             | `string`     | yes      | Stable identifier. Used for last-used tracking, `pinnedWallet` matching, and the `data-wallet-id` attribute on the modal row.                                                                                                        |
| `name`           | `string`     | yes      | Display label.                                                                                                                                                                                                                       |
| `priority`       | `number`     | yes      | Lower numbers sort earlier among non-pinned wallets (ascending).                                                                                                                                                                     |
| `icon`           | `string`     | yes      | URL or `data:` URI for the wallet's logo. Leave `''` to let Wallet Standard discovery fill it in (when the extension is installed); otherwise the fallback initial-letter avatar renders.                                            |
| `deepLinkScheme` | `string`     | yes      | Custom URL scheme (e.g., `phantom://`) used by the mobile deep-link probe.                                                                                                                                                           |
| `universalLink`  | `string`     | yes      | HTTPS universal link (e.g., `https://phantom.app/ul/v1/connect`).                                                                                                                                                                    |
| `appStoreUrl`    | `string`     | yes      | iOS App Store URL. Used as fallback when the deep link isn't intercepted (i.e., wallet not installed).                                                                                                                               |
| `playStoreUrl`   | `string`     | yes      | Google Play URL. Android fallback.                                                                                                                                                                                                   |
| `standardName`   | `WalletName` | no       | The wallet's Wallet Standard registration name. Paired with the live registry at discovery time so detection lights up the "Detected" badge and unlocks `signMessage` / `signIn`. Use `asWalletName('Phantom')` to brand the string. |

See [wallets.md](./wallets.md) for ready-to-paste configs for every common wallet.

## `FlowState`

The states the manager moves through during a connect flow:

```ts
type FlowState =
  | 'idle' // no connect in flight, no wallet attached
  | 'connecting' // user picked a wallet, awaiting its approval
  | 'connected' // wallet returned a public key
  | 'signing' // SIWS signing in flight (only with requireSignIn)
  | 'authenticated' // flow complete (auto-step from 'connected' if !requireSignIn)
  | 'error' // last transition failed; see context.error
```

`useWallet()` exposes `state` plus boolean slices (`isConnecting`, `isConnected`, `isSigning`, `isAuthenticated`).

## `FlowContext`

Side-band data carried with the state, read via `useWallet()` or `manager.getContext()`:

```ts
interface FlowContext {
  walletId: string | null // id of the in-flight or connected wallet
  publicKey: string | null // base58 address, set on WALLET_CONNECTED
  signature: string | null // base58 SIWS signature, set on SIGN_COMPLETED
  requireSignIn: boolean // mirrors the config flag
  error: WalletError | null // cleared on RESET
}
```

## Where to set things

| What                     | React                                  | Vue                                   |
| ------------------------ | -------------------------------------- | ------------------------------------- |
| Construct the manager    | `<WalletConnectProvider config={...}>` | `app.use(WalletConnectPlugin, {...})` |
| Read flow state          | `useWallet()`                          | `useWallet()`                         |
| Read raw manager         | `useWalletContext()`                   | `useWalletContext()`                  |
| Mount the connect button | `<ConnectButton />`                    | `<ConnectButton />`                   |

Both Provider/Plugin take the same `WalletManagerConfig` object; the rest of the API surface is identical.
