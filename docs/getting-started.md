# Getting started

Zero to a working Connect Wallet button in under ten minutes. Pick **React** or **Vue** below — the rest of the API surface is identical between the two.

> Looking for a runnable reference? See `examples/vue-example/` — Vue 3.5 + Vite demo with four scenarios (basic connect, SIWS sign-in, custom priority, neutral mode). Run with `pnpm --filter @monolithlabs/wallet-connect-vue-example dev`. A matching React example is planned (PLAN.md TASK-601).

## What you'll build

A page-level button that, when clicked, opens a wallet picker, runs the connect flow against the user's chosen wallet (browser extension or mobile wallet via deep link), and exposes the connected public key to your app. Three of the most common Solana wallets — Phantom, Solflare, and Opindex — are wired up by default.

```
┌────────────────────────────┐         ┌───────────────────────────┐
│  [ Connect Wallet ]        │  click  │   Select a wallet         │
│                            │  ────▶  │                           │
│                            │         │   ▣ Phantom               │
│                            │         │   ▣ Solflare              │
│                            │         │   ▣ Opindex     Install   │
└────────────────────────────┘         └───────────────────────────┘
```

## 1. Install

The library ships three published packages — one for framework-agnostic logic, one each for React and Vue. Install the framework package matching your stack; it pulls in the core package automatically.

```bash
# React
npm install @monolithlabs/wallet-connect-react

# Vue
npm install @monolithlabs/wallet-connect-vue
```

Peer dependencies:

- React: `react >= 19`, `react-dom >= 19`.
- Vue: `vue ^3.5`.

## 2. Wire up a `WalletManager`

The manager is the single source of truth for the connect flow. You define it once with a config, mount the matching Provider/Plugin around your app, and consume it from any component via `useWallet()` / `<ConnectButton>`.

### React

```tsx
// src/wallets.ts
import { asWalletName, type WalletConfig } from '@monolithlabs/wallet-connect-core'

export const PHANTOM: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '', // empty renders a placeholder box; provide a real URL/data URI for a polished modal
  standardName: asWalletName('Phantom'),
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/phantom-crypto-wallet/id1598432977',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=app.phantom',
}
```

```tsx
// src/App.tsx
import type { WalletManagerConfig } from '@monolithlabs/wallet-connect-core'
import { ConnectButton, WalletConnectProvider } from '@monolithlabs/wallet-connect-react'

import { PHANTOM } from './wallets'

// Module-scope so the object identity is stable across re-renders. An
// inline `{...}` literal would force the manager to rebuild every render.
const config: WalletManagerConfig = {
  wallets: [PHANTOM],
}

export function App() {
  return (
    <WalletConnectProvider config={config}>
      <ConnectButton />
    </WalletConnectProvider>
  )
}
```

That's the minimum viable connect button. Click it; the modal opens; pick Phantom; approve in the wallet; your app is connected.

### Vue

```ts
// src/main.ts
import { createApp } from 'vue'
import { WalletConnectPlugin } from '@monolithlabs/wallet-connect-vue'

import App from './App.vue'
import { PHANTOM } from './wallets'

createApp(App)
  .use(WalletConnectPlugin, { wallets: [PHANTOM] })
  .mount('#app')
```

```vue
<!-- src/App.vue -->
<script setup lang="ts">
import { ConnectButton } from '@monolithlabs/wallet-connect-vue'
</script>

<template>
  <ConnectButton />
</template>
```

Same shape: install the plugin once with your config, drop the `<ConnectButton>` anywhere.

## 3. React to the connected state

`<ConnectButton>` already shows the truncated public key once connected, but most apps want to read it themselves and gate features on the flow state.

### React

```tsx
import { useWallet } from '@monolithlabs/wallet-connect-react'

function MyAccountBadge() {
  const { state, publicKey, isAuthenticated } = useWallet()
  if (state === 'idle') return <p>Not connected.</p>
  return (
    <p>
      Connected as {publicKey} — {isAuthenticated ? 'signed in' : 'connecting…'}
    </p>
  )
}
```

### Vue

```vue
<script setup lang="ts">
import { useWallet } from '@monolithlabs/wallet-connect-vue'

const { state, publicKey, isAuthenticated } = useWallet()
</script>

<template>
  <p v-if="state === 'idle'">Not connected.</p>
  <p v-else>Connected as {{ publicKey }} — {{ isAuthenticated ? 'signed in' : 'connecting…' }}</p>
</template>
```

The fields are the same on both frameworks; React returns plain values, Vue returns refs (auto-unwrapped in `<template>`).

## 4. Add Sign-In With Solana

Set `requireSignIn: true` and provide a `signInMessage`. After the wallet returns a public key, the manager runs an SIWS signing step automatically. The signed message goes into `signature` and `onAuthenticated` fires.

```ts
const config: WalletManagerConfig = {
  wallets: [PHANTOM],
  requireSignIn: true,
  signInMessage: (publicKey) =>
    publicKey === ''
      ? 'Sign in to MyApp.' // mobile bundles the message before the public key is known
      : `Sign in to MyApp as ${publicKey}.`,
  onAuthenticated: (publicKey, signature) => {
    // Send `publicKey` + base58 `signature` to your backend to verify.
  },
}
```

See [configuration.md](./configuration.md) for the full callback list.

## 5. Initialize on page load

Mobile flows complete in a redirect round-trip. The user clicks "Phantom" in your modal, leaves the page to approve in the Phantom app, and lands back on your site. The Provider (React) / Plugin (Vue) automatically calls `manager.initialize()` on mount to detect that callback and resume the flow — you don't have to call anything yourself.

The Provider/Plugin layer takes care of this; you only need to think about it if you're wiring a `WalletManager` manually outside React or Vue. See [mobile.md](./mobile.md) for the deep-link flow internals.

## What's next

- [configuration.md](./configuration.md) — every `WalletManagerConfig` option, type, default, and example.
- [wallets.md](./wallets.md) — copy-pasteable configs for Phantom, Solflare, Backpack, Coinbase Wallet, Trust, and Opindex.
- [mobile.md](./mobile.md) — how the mobile deep-link round-trip works, callback URL setup, SIWS bundling.
- [opindex.md](./opindex.md) — what Opindex pinning does and how to disable it.
- [contributing.md](./contributing.md) — adding a new wallet adapter.
