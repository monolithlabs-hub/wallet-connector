import { asWalletName, type WalletConfig } from '@monolithlabs-hub/wallet-connect-core'

// Inline "O" badge for Opindex — Opindex isn't a Wallet Standard wallet,
// so any auto-merge / discovery cannot fill its icon from the registry.
// Phantom and Solflare leave `icon` empty; consumers with the extensions
// installed see the wallet's data-URI icon picked up at runtime.
const OPINDEX_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="20" fill="#111"/>' +
      '<text x="50%" y="55%" font-size="20" fill="#fff" text-anchor="middle" ' +
      'dominant-baseline="middle" font-family="system-ui" font-weight="bold">O</text>' +
      '</svg>',
  )

// Opindex is a mobile DEEP-LINK wallet: on a mobile browser, tapping it
// navigates to its universal link and the user approves in the Opindex app,
// then returns to the dapp — the same round-trip Solflare and Phantom use.
// Apple App Site Association / Android assetlinks are configured on
// `opindex.deeptap.io`, so that bare domain is the deep-link target (the
// library appends the encrypted-handshake query params to it).
// - Mobile, app installed → opens Opindex, approve, redirect back to the dapp.
// - Mobile, app NOT installed → `installUrl` after the 1500ms fallback timer.
// - Desktop without the extension → `extensionUrl` (Chrome Web Store).
// - In-app browser / with extension → detected via Wallet Standard, merged.
export const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: OPINDEX_ICON,
  standardName: asWalletName('Opindex Wallet'),
  deepLinkScheme: 'opindexwallet://',
  universalLink: 'https://opindex.deeptap.io',
  installUrl: 'https://opindex.deeptap.io',
  extensionUrl: 'https://chromewebstore.google.com/detail/dokalonchfclkijncpagjgiamnghiaec',
}

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
