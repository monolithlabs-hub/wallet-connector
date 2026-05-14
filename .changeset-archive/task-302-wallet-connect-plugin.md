---
'@monolithlabs-hub/wallet-connect-vue': minor
---

TASK-302 — add `WalletConnectPlugin` to `@monolithlabs-hub/wallet-connect-vue`.

A Vue 3 plugin that creates a single `WalletManager` per app and `app.provide()`s it under `WalletConnectInjectionKey`. The composables (`useWallet`, `useWalletContext`) and the future `<ConnectButton.vue>` (TASK-303) all read from this injection.

```ts
import { createApp } from 'vue'
import { WalletConnectPlugin } from '@monolithlabs-hub/wallet-connect-vue'

const app = createApp(App)
app.use(WalletConnectPlugin, {
  wallets: [phantom, solflare, opindex],
  requireSignIn: true,
  signInMessage: (pk) => `Sign in to MyApp as ${pk}`,
})
app.mount('#app')
```

Typed as `Plugin<[WalletManagerConfig]>` — the config arg is required, TS catches missing configs at the call site.

**Lifecycle**: manager is built once per `install` call. `app.onUnmount(() => manager.destroy())` cleans up on `app.unmount()` (relevant for tests and SSR; long-lived SPAs never trigger it). SSR-safe: `detectPlatform()` resolves to `install-prompt` on the server, so neither the Wallet-Standard discovery nor the deep-link adapter is created — the manager is essentially inert until hydration.

Installing the plugin twice on the same app creates two managers and leaks the first — documented in JSDoc as a "don't do this", no runtime guard. Both Phase 2 (React Provider) and Phase 3 (Vue Plugin) share this footgun; future package-level `manager: WalletManager` prop API would eliminate it.

7 plugin tests covering all 3 PLAN.md acceptance criteria (install doesn't throw, single manager per app, no-plugin error) plus 4 extras: config passed to createWalletManager, useWallet picks up the provided manager, useWalletContext does too, destroy fires on `app.unmount()`.
