import {
  createWalletManager,
  type WalletManager,
  type WalletManagerConfig,
} from '@monolithlabs/wallet-connect-core'
import type { Plugin } from 'vue'

import { WalletConnectInjectionKey } from '../context/injection-key'

/**
 * Vue 3 plugin that builds a single {@link WalletManager} for the app and
 * makes it available via `inject(WalletConnectInjectionKey)` (and through
 * the higher-level `useWallet()` / `useWalletContext()` composables).
 *
 * **Requires Vue 3.5+** — uses `app.onUnmount` for cleanup.
 *
 * Install at app creation time:
 *
 * ```ts
 * import { createApp } from 'vue'
 * import { WalletConnectPlugin } from '@monolithlabs/wallet-connect-vue'
 *
 * const app = createApp(App)
 * app.use(WalletConnectPlugin, {
 *   wallets: [phantom, solflare, opindex],
 *   requireSignIn: true,
 *   signInMessage: (pk) => `Sign in to MyApp as ${pk}`,
 * })
 * app.mount('#app')
 * ```
 *
 * **Lifecycle**: the manager is created exactly once per `install` call.
 * If `app.unmount()` is ever called (typically only in tests and SSR
 * setups, not production SPAs), `manager.destroy()` runs via Vue's
 * `app.onUnmount` hook. For long-lived single-page apps the manager
 * lives for the lifetime of the document — there is no action a
 * consumer needs to take.
 *
 * **SSR**: safe to install inside `createSSRApp(...).use(WalletConnectPlugin, config)`.
 * `createWalletManager` has real side effects (it subscribes to the
 * Wallet-Standard registry via `discoverStandardWallets()` on the
 * `extension` platform strategy), but `detectPlatform()` resolves to
 * `install-prompt` on the server, so the discovery + deep-link branches
 * are skipped and the manager is essentially inert until hydration.
 *
 * **Idempotency**: Vue's `app.use` dedupes plugin installs per-app — the
 * second `app.use(WalletConnectPlugin, ...)` call on the same app is a
 * no-op (Vue logs a dev warning). The config from the second call is
 * **silently ignored**, which is worth knowing if you're tempted to
 * re-`use` to swap configuration at runtime. To swap config, call
 * `app.unmount()` and create a fresh app — the `onUnmount` hook
 * destroys the old manager cleanly first.
 */
export const WalletConnectPlugin: Plugin<[WalletManagerConfig]> = {
  install(app, config) {
    const manager: WalletManager = createWalletManager(config)
    app.provide(WalletConnectInjectionKey, manager)
    app.onUnmount(() => {
      manager.destroy()
    })
  },
}
