# Supported wallets

Copy-pasteable `WalletConfig` entries for every wallet the library has been verified against. **Opindex is the wallet this library is built for** — it's listed first below and pinned by default; add any of the others the same way by dropping more `WalletConfig` entries into `WalletManagerConfig.wallets`. The manager uses the Wallet Standard registry under the hood to connect on desktop and the per-wallet Universal Link contract on mobile.

The `WalletConfig` shape is documented in [configuration.md](./configuration.md#walletconfig). The most relevant fields per wallet:

- `icon` should be a real URL or `data:` URI. An empty string renders a small placeholder box, which is fine for development but not for a polished modal.
- `standardName` is the wallet's Wallet Standard registration name. The manager pairs the configured wallet to its `StandardWalletAdapter` by this name first; if you leave it off, it falls back to case-insensitive matching on `name`.
- `deepLinkScheme` / `universalLink` / `appStoreUrl` / `playStoreUrl` are only consulted on the mobile (`'deeplink'`) strategy.

## Opindex

```ts
import { asWalletName, type WalletConfig } from '@monolithlabs-hub/wallet-connect-core'

export const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '', // the example apps ship a small inline SVG; provide your own branding
  standardName: asWalletName('Opindex Wallet'),
  deepLinkScheme: 'opindexwallet://',
  universalLink: 'https://opindex.deeptap.io',
  installUrl: 'https://opindex.deeptap.io',
  extensionUrl: 'https://chromewebstore.google.com/detail/dokalonchfclkijncpagjgiamnghiaec',
}
```

Opindex is the library's home wallet and the default pinned entry, so it leads the
modal regardless of its `priority` (see [opindex.md](./opindex.md) for the
transparency disclosure and the `pinnedWallet: null` disable knob). It works on
every platform:

- **Desktop:** the Opindex Chrome extension registers via Wallet Standard as
  `Opindex Wallet`. Without the extension, the modal links to `extensionUrl`.
- **Mobile:** a deep-link round-trip to `universalLink`
  (`https://opindex.deeptap.io`, where Opindex's iOS App Site Association /
  Android assetlinks are configured) — the same shape as Solflare. If the app
  isn't installed, the modal falls back to `installUrl` after the 1500 ms
  deep-link probe.

`installUrl` is the mobile download/landing page (`opindex.deeptap.io`) — **not**
an App Store / Play Store URL. Provide a real `icon` for a polished modal; the
example apps ship a small inline SVG you can copy or replace with your own
branding.

## Phantom

```ts
import { asWalletName, type WalletConfig } from '@monolithlabs-hub/wallet-connect-core'

export const PHANTOM: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  standardName: asWalletName('Phantom'),
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/phantom-crypto-wallet/id1598432977',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=app.phantom',
}
```

Phantom's Universal Link API is the parameter shape `buildConnectUrl` / `buildSignAndConnectUrl` target, so it's the reference format other deep-link wallets (including Opindex) follow. Phantom does NOT consume the bundled `sign_in_message` parameter yet, so on mobile + `requireSignIn: true` Phantom currently produces two prompts (connect then sign) instead of one. The library transparently handles both shapes.

## Solflare

```ts
export const SOLFLARE: WalletConfig = {
  id: 'solflare',
  name: 'Solflare',
  priority: 2,
  icon: '',
  standardName: asWalletName('Solflare'),
  deepLinkScheme: 'solflare://',
  universalLink: 'https://solflare.com/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/solflare/id1580902717',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.solflare.mobile',
}
```

Solflare follows Phantom's Universal Link contract. Solflare DOES consume bundled SIWS — `requireSignIn: true` on mobile is a single round-trip.

## Backpack

```ts
export const BACKPACK: WalletConfig = {
  id: 'backpack',
  name: 'Backpack',
  priority: 3,
  icon: '',
  standardName: asWalletName('Backpack'),
  deepLinkScheme: 'backpack://',
  universalLink: 'https://backpack.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/backpack-wallet/id6443944476',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=app.backpack.mobile',
}
```

Backpack supports the Phantom-style Universal Link API and Wallet Standard. Detection works on the desktop extension and the iOS / Android apps.

## Coinbase Wallet

```ts
export const COINBASE: WalletConfig = {
  id: 'coinbase',
  name: 'Coinbase Wallet',
  priority: 4,
  icon: '',
  standardName: asWalletName('Coinbase Wallet'),
  deepLinkScheme: 'cbwallet://',
  universalLink: 'https://go.cb-w.com/wallet',
  appStoreUrl: 'https://apps.apple.com/app/coinbase-wallet/id1278383455',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=org.toshi',
}
```

Coinbase Wallet's mobile deep link uses a different URL format than Phantom's; the library's `DeepLinkBuilder` is currently Phantom-shaped. Coinbase Wallet works fine on desktop (Wallet Standard discovery handles it); the mobile deep-link path is best-effort and may fall back to the App Store / Play Store after the 1500 ms probe timeout. If this matters for your dapp, the workaround is to configure a Coinbase-specific universal link via your own dispatcher page.

## Trust Wallet

```ts
export const TRUST: WalletConfig = {
  id: 'trust',
  name: 'Trust',
  priority: 5,
  icon: '',
  standardName: asWalletName('Trust'),
  deepLinkScheme: 'trust://',
  universalLink: 'https://link.trustwallet.com/open_url',
  appStoreUrl: 'https://apps.apple.com/app/trust-crypto-bitcoin-wallet/id1288339409',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=com.wallet.crypto.trustapp',
}
```

Same caveat as Coinbase — Trust's deep-link URL format isn't the Phantom universal-link shape. Desktop is fully supported via Wallet Standard; mobile uses store fallback.

## Recipe: a balanced default set

A reasonable default for a new dapp:

```ts
export const DEFAULT_WALLETS: WalletConfig[] = [OPINDEX, PHANTOM, SOLFLARE, BACKPACK]
```

Opindex pinned first (or not — see [opindex.md](./opindex.md)), plus three desktop/mobile-supported wallets users commonly have installed. If a user has another Wallet Standard wallet installed that isn't in your list, it's auto-merged into the modal with a "Detected" badge — you don't have to enumerate every wallet.
