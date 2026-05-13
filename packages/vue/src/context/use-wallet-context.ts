import type { WalletManager } from '@monolithlabs/wallet-connect-core'
import { getCurrentInstance, inject } from 'vue'

import { WalletConnectInjectionKey } from './injection-key'

/**
 * Read the {@link WalletManager} from the Vue injection set up by the
 * `<WalletConnectPlugin>` (TASK-302). Throws a descriptive error in two
 * distinct failure modes:
 *
 * - Called outside a component `setup()` function (no current Vue
 *   instance to look up the injection on).
 * - Called inside `setup()` but no Plugin installed in the app.
 *
 * Internal-leaning primitive — `useWallet()` is the higher-level public
 * composable and is what most consumers should use. Reach for
 * `useWalletContext()` when you need the raw manager (e.g., to call
 * methods that aren't part of `useWallet`'s return shape, or to build
 * alternative integrations on top of the manager).
 */
export function useWalletContext(): WalletManager {
  if (!getCurrentInstance()) {
    throw new Error('useWalletContext() must be called from a component setup() function')
  }
  const manager = inject(WalletConnectInjectionKey, null)
  if (!manager) {
    throw new Error(
      'useWalletContext() must be used inside an app that installs WalletConnectPlugin',
    )
  }
  return manager
}
