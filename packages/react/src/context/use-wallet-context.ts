import type { WalletManager } from '@monolithlabs-hub/wallet-connect-core'
import { useContext } from 'react'

import { WalletConnectContext } from './wallet-connect-context'

/**
 * Read the {@link WalletManager} from {@link WalletConnectContext}. Throws
 * a descriptive error if called outside a `<WalletConnectProvider>`.
 *
 * Internal-leaning primitive — `useWallet()` is the higher-level public
 * hook and is what most consumers should use. Reach for `useWalletContext`
 * when you need the raw manager (e.g., to call methods that aren't part
 * of `useWallet`'s return shape, or to build your own React-Solana
 * integration on top of the manager).
 */
export function useWalletContext(): WalletManager {
  const manager = useContext(WalletConnectContext)
  if (!manager) {
    throw new Error('useWalletContext() must be used inside a <WalletConnectProvider>')
  }
  return manager
}
