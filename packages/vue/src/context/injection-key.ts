import type { WalletManager } from '@monolithlabs-hub/wallet-connect-core'
import type { InjectionKey } from 'vue'

/**
 * Vue {@link InjectionKey} that the `<WalletConnectPlugin>` (TASK-302)
 * `app.provide()`s and that `useWallet()` / `useWalletContext()` read via
 * `inject()`. Symbol-typed so the value type flows automatically — no
 * casts needed at the consumption side.
 *
 * Exported for tests that wire a stub manager via `provide` directly
 * without going through the Plugin. End-users should prefer the Plugin
 * once it lands.
 */
export const WalletConnectInjectionKey: InjectionKey<WalletManager> = Symbol(
  '@monolithlabs-hub/wallet-connect-vue:WalletManager',
)
