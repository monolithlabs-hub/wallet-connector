import type { WalletConfig, WalletManagerConfig } from '@monolithlabs/wallet-connect-core'
import { ConnectButton, WalletConnectProvider } from '@monolithlabs/wallet-connect-react'

const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '',
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/opindex',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=opindex',
}

const PHANTOM: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
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
