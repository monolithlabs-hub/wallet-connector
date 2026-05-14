import type { WalletManager } from '@monolithlabs-hub/wallet-connect-core'
import { createContext } from 'react'

/**
 * Internal React context that holds the shared {@link WalletManager}
 * instance for a subtree. Consumed by `useWallet()` (TASK-201) and
 * supplied by `<WalletConnectProvider>` (TASK-202).
 *
 * Exported from the package so tests can wrap a component tree with a
 * stub manager directly via `WalletConnectContext.Provider`. End-users
 * should prefer the public Provider once it lands.
 */
export const WalletConnectContext = createContext<WalletManager | null>(null)
WalletConnectContext.displayName = 'WalletConnectContext'
