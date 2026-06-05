import { asWalletName, type WalletConfig } from '@monolithlabs-hub/wallet-connect-core'

// Inline "O" badge for Opindex — Opindex isn't a Wallet Standard wallet,
// so the merge can't auto-fill its icon from the registry. Phantom and
// Solflare leave `icon` empty and pick up their data-URI icons from the
// Wallet Standard registration at runtime (when the extension is
// installed; otherwise the initial-letter avatar fallback renders).
const OPINDEX_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="20" fill="#111"/>' +
      '<text x="50%" y="55%" font-size="20" fill="#fff" text-anchor="middle" ' +
      'dominant-baseline="middle" font-family="system-ui" font-weight="bold">O</text>' +
      '</svg>',
  )

// Opindex is an "install/open-only" wallet on mobile: it has NO external
// mobile connect protocol (no Phantom-style universal link). It only connects
// inside its own in-app browser, where it registers via Wallet Standard as
// "Opindex Wallet". So we omit `universalLink` (which marks it install/open-only).
// - Mobile browser → `installUrl` (download/landing page).
// - Desktop without the extension → `extensionUrl` (Chrome Web Store), opened
//   in a new tab; once installed it's detected via Wallet Standard.
// - In-app browser / with extension → detected and merged into one row.
export const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: OPINDEX_ICON,
  standardName: asWalletName('Opindex Wallet'),
  deepLinkScheme: 'opindexwallet://',
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
