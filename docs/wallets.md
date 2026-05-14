# Supported wallets

Copy-pasteable `WalletConfig` entries for every wallet the library has been verified against. The library will work with any wallet that registers via the Solana Wallet Standard, even if it isn't listed here — Wallet Standard discovery picks them up automatically.

The `WalletConfig` shape is documented in [configuration.md](./configuration.md#walletconfig). The most relevant fields per wallet:

- `icon: ''` is normal. Leave it empty and Wallet Standard discovery fills it from the installed extension's `wallet.icon` data URI.
- `standardName` is the wallet's Wallet Standard registration name. The library uses it for fast detection; if you leave it off, the library falls back to case-insensitive matching on `name`.
- `deepLinkScheme` / `universalLink` / `appStoreUrl` / `playStoreUrl` are only consulted on the mobile (`'deeplink'`) strategy.

## Phantom

```ts
import { asWalletName, type WalletConfig } from '@monolithlabs/wallet-connect-core'

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

Phantom is the canonical mobile Solana wallet — its Universal Link API is what `buildConnectUrl` / `buildSignAndConnectUrl` target. Phantom does NOT consume the bundled `sign_in_message` parameter yet, so on mobile + `requireSignIn: true` Phantom currently produces two prompts (connect then sign) instead of one. The library transparently handles both shapes.

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

## Opindex

```ts
export const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '/* inline SVG data URI; see examples/react-example/src/wallets.ts */',
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/opindex',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=opindex',
}
```

Opindex is the library's default pinned wallet. The `priority: 10` keeps it last among non-pinned wallets, which matters when the pin is disabled (`pinnedWallet: null` or desktop without the Opindex extension). See [opindex.md](./opindex.md) for the transparency disclosure and the disable knob.

Opindex isn't a Wallet Standard wallet yet, so `icon: ''` won't auto-fill from the registry. The library's example apps ship a small inline SVG; substitute your own branding if you have it.

## Auto-discovered wallets

You don't have to list a wallet in `config.wallets` for it to show up. Any wallet registered with the Wallet Standard registry — Glow, Snap, Decaf, Talisman, MathWallet, etc. — gets auto-appended to the modal as a "discovered" entry, with its `wallet.icon` data URI and the "Detected" badge. The user can connect to it via `manager.connect('<slugified-name>')` exactly like a configured wallet (the React/Vue `<ConnectButton>` handles the slug derivation internally).

If you want a discovered wallet to have a custom `priority` or to surface its mobile deep-link metadata, just add it to `config.wallets` — the merge prefers configured entries when names match.

## Recipe: a balanced default set

A reasonable default for a new dapp:

```ts
export const DEFAULT_WALLETS: WalletConfig[] = [PHANTOM, SOLFLARE, BACKPACK, OPINDEX]
```

Three desktop/mobile-supported wallets users actually have installed, plus Opindex pinned (or not — see [opindex.md](./opindex.md)). Auto-discovery handles the long tail.
