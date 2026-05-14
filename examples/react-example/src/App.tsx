import {
  asWalletName,
  type WalletConfig,
  type WalletManagerConfig,
} from '@monolithlabs/wallet-connect-core'
import { ConnectButton, WalletConnectProvider } from '@monolithlabs/wallet-connect-react'

// Inline "O" badge for Opindex — Opindex isn't a Wallet Standard wallet, so
// the merge can't auto-fill its icon from the registry. Phantom/Solflare
// omit `icon` entirely and pick up their data-URI icons from the Wallet
// Standard registration at runtime.
const OPINDEX_ICON =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">' +
      '<circle cx="20" cy="20" r="20" fill="#111"/>' +
      '<text x="50%" y="55%" font-size="20" fill="#fff" text-anchor="middle" ' +
      'dominant-baseline="middle" font-family="system-ui" font-weight="bold">O</text>' +
      '</svg>',
  )

const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: OPINDEX_ICON,
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/opindex',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=opindex',
}

const PHANTOM: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  // icon omitted: filled in by the Wallet Standard registry when the
  // Phantom extension is installed. The fallback initial-letter avatar
  // renders if not.
  icon: '',
  standardName: asWalletName('Phantom'),
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/phantom-crypto-wallet/id1598432977',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=app.phantom',
}

const SOLFLARE: WalletConfig = {
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

// Module-scope config — keeps the object identity stable across parent
// re-renders so `<WalletConnectProvider>` doesn't rebuild the manager
// on every render. Passing an inline `{...}` literal here would
// recreate the manager every render (it's documented on the Provider's
// JSDoc).
const walletConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  requireSignIn: false,
  signInMessage: (publicKey) =>
    `localhost wants you to sign in with your Solana account:\n${publicKey}\n\nSign in to wallet-connect example.`,
  onAuthenticated: (publicKey, signature) => {
    console.log('[example] authenticated', { publicKey, signature })
  },
}

export function App() {
  return (
    <WalletConnectProvider config={walletConfig}>
      <main
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 32,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          alignItems: 'flex-start',
        }}
      >
        <h1 style={{ margin: 0, fontSize: 20 }}>wallet-connect example</h1>
        <ConnectButton />
      </main>
    </WalletConnectProvider>
  )
}
