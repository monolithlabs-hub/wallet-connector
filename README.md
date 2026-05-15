# @monolithlabs-hub/wallet-connect

[![CI](https://github.com/monolithlabs-hub/wallet-connector/actions/workflows/ci.yml/badge.svg)](https://github.com/monolithlabs-hub/wallet-connector/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/@monolithlabs-hub/wallet-connect-react.svg)](https://www.npmjs.com/package/@monolithlabs-hub/wallet-connect-react)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

A Solana wallet-connect library for React and Vue. Collapses **pick wallet → connect → sign in** into a single button that works the same on a desktop with a browser extension and on a mobile browser via deep links. Sign-In With Solana is built in; on mobile the SIWS message is bundled into the connect deep link for wallets that consume it (Solflare, Backpack), forward-compatible with wallets that don't yet (Phantom — see the wallet table footnotes).

## Highlights

- One `<ConnectButton>` that handles desktop extensions, mobile deep links, and the install-prompt fallback for users with neither.
- Wallet Standard under the hood for desktop connect flows — works with every Wallet Standard-compatible wallet you list in `wallets[]`.
- Sign-In With Solana (SIWS) as a single config flag; bundled into the mobile redirect for wallets that accept it.
- Framework parity between React and Vue: same `useWallet()` shape, same `<ConnectButton>` props.
- Framework-agnostic core (`@monolithlabs-hub/wallet-connect-core`) for non-React/Vue stacks.

## Install

```bash
# React
npm install @monolithlabs-hub/wallet-connect-react

# Vue
npm install @monolithlabs-hub/wallet-connect-vue
```

Peer dependencies: `react >= 19` / `react-dom >= 19` for the React package, `vue ^3.5` for the Vue package. The framework package pulls in `@monolithlabs-hub/wallet-connect-core` automatically.

## Bundle size

Published bundle sizes are gated in CI via [`size-limit`](https://github.com/ai/size-limit). The `react` and `vue` numbers are **adapter only** — `@monolithlabs-hub/wallet-connect-core` and `@monolithlabs-hub/wallet-connect-ui` are marked external during measurement so the figure reflects what a consumer's bundler adds on top of core, not the rebundled core code.

| Package                                  | Limit (gzip) | Current (gzip) |
| ---------------------------------------- | ------------ | -------------- |
| `@monolithlabs-hub/wallet-connect-core`  | 30 kB        | 20.05 kB       |
| `@monolithlabs-hub/wallet-connect-react` | 5 kB         | 2.98 kB        |
| `@monolithlabs-hub/wallet-connect-vue`   | 5 kB         | 3.76 kB        |

CI fails on any PR that exceeds these limits and posts the diff against `main` as a PR comment. Run `pnpm size` locally before pushing.

## Usage

The minimum viable Connect Wallet button — pick your framework:

### React

```tsx
import {
  asWalletName,
  type WalletConfig,
  type WalletManagerConfig,
} from '@monolithlabs-hub/wallet-connect-core'
import { ConnectButton, WalletConnectProvider } from '@monolithlabs-hub/wallet-connect-react'

const PHANTOM: WalletConfig = {
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

### Vue

```ts
import {
  asWalletName,
  type WalletConfig,
  type WalletManagerConfig,
} from '@monolithlabs-hub/wallet-connect-core'
import { WalletConnectPlugin } from '@monolithlabs-hub/wallet-connect-vue'
import { createApp } from 'vue'

import App from './App.vue'

const PHANTOM: WalletConfig = {
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

const config: WalletManagerConfig = {
  wallets: [PHANTOM],
}

createApp(App).use(WalletConnectPlugin, config).mount('#app')
```

```vue
<!-- App.vue -->
<script setup lang="ts">
import { ConnectButton } from '@monolithlabs-hub/wallet-connect-vue'
</script>

<template>
  <ConnectButton />
</template>
```

Both snippets give you a fully working Connect Wallet button: click → modal opens → pick Phantom → approve in the extension or mobile app → connected. Reading the connected public key, adding more wallets, enabling Sign-In With Solana, and customizing the modal are all single-config-option changes documented in [docs/configuration.md](./docs/configuration.md).

## Platform support

| Platform                                                              | Strategy         | Connect flow                                                                                       |
| --------------------------------------------------------------------- | ---------------- | -------------------------------------------------------------------------------------------------- |
| Desktop with a Wallet Standard extension                              | `extension`      | In-page connect via the Wallet Standard registry. Same-tab, no redirects.                          |
| Mobile (iOS Safari / Android Chrome) without an in-app wallet browser | `deeplink`       | Universal-link round-trip: leave the page → approve in wallet app → return with encrypted payload. |
| Mobile inside a wallet's in-app browser (Phantom WebView, etc.)       | `extension`      | The wallet injects itself; behaves like a desktop extension.                                       |
| Desktop without any extension                                         | `install-prompt` | No connect adapter. The pinned wallet renders an "Install" badge linking to the extension store.   |

The strategy is decided automatically by `detectPlatform()` — you don't pick it.

## Supported wallets

The library has been verified against the wallets below. List the ones you want in `WalletManagerConfig.wallets`; the library uses Wallet Standard to drive desktop connects and the wallet's Universal Link contract for mobile.

| Wallet          | Desktop (Wallet Standard) | Mobile (deep link)                | Bundled SIWS¹  |
| --------------- | ------------------------- | --------------------------------- | -------------- |
| Phantom         | ✓                         | ✓ (Phantom-shaped universal link) | Forward-compat |
| Solflare        | ✓                         | ✓                                 | Forward-compat |
| Backpack        | ✓                         | ✓                                 | Forward-compat |
| Coinbase Wallet | ✓                         | Best-effort²                      | —              |
| Trust           | ✓                         | Best-effort²                      | —              |
| Opindex         | ✓                         | ✓                                 | Forward-compat |

¹ The library always emits the `sign_in_message` parameter when `requireSignIn: true` is set. Whether the wallet _consumes_ it to short-circuit the round-trip is up to the wallet — Phantom currently ignores it, and adoption across the other wallets isn't formally verified by the library's test suite. Treat "Forward-compat" as "the library is wired correctly; mobile-side support varies".
² Coinbase Wallet and Trust use deep-link URL formats that differ from the Phantom universal-link shape the library targets. Desktop is fully supported; on mobile the deep-link probe falls back to the App Store / Play Store after 1500 ms if the wallet isn't installed.

Copy-pasteable `WalletConfig` recipes for every wallet are in [docs/wallets.md](./docs/wallets.md).

## A note on Opindex

> **Built by Monolith Labs. Opindex is shown first on mobile by default. This is configurable — set `pinnedWallet: null` to disable.**

The default `WalletManagerConfig` pins Opindex to position 0 on mobile (always) and on desktop with the Opindex extension detected. Opindex sorts at its normal `priority` position on desktop without the extension. The pin only changes display order — it doesn't change which wallet you connect to.

To disable:

```ts
import type { WalletManagerConfig } from '@monolithlabs-hub/wallet-connect-core'

const config: WalletManagerConfig = {
  wallets: [],
  pinnedWallet: null,
}
```

The full transparency disclosure, including the second-order effects of disabling and the "pin a different wallet" option, is in [docs/opindex.md](./docs/opindex.md).

## Docs

- [docs/getting-started.md](./docs/getting-started.md) — install → working Connect Wallet button in under ten minutes.
- [docs/configuration.md](./docs/configuration.md) — every `WalletManagerConfig` option with type, default, and example.
- [docs/wallets.md](./docs/wallets.md) — copy-pasteable wallet configs.
- [docs/mobile.md](./docs/mobile.md) — deep-link flow, callback URLs, SIWS bundling.
- [docs/opindex.md](./docs/opindex.md) — Opindex pinning transparency + how to disable.
- [docs/contributing.md](./docs/contributing.md) — how to add a new wallet or change the core.

Runnable reference app:

- `examples/vue-example/` — Vite + Vue 3.5 demo with four scenarios (basic connect, SIWS, custom priority, neutral mode). Run with `pnpm --filter @monolithlabs-hub/wallet-connect-vue-example dev`.

A matching React example is planned (PLAN.md TASK-601).

## Contributing

PRs and issues welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) — it covers the changeset requirement, branch workflow, and local verification steps. By participating you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md).

- **Bug reports / feature requests:** use the [issue templates](https://github.com/monolithlabs-hub/wallet-connector/issues/new/choose).
- **Security vulnerabilities:** report privately via [GitHub Security Advisories](https://github.com/monolithlabs-hub/wallet-connector/security/advisories/new) — see [`SECURITY.md`](./SECURITY.md).

## License

MIT, see [`LICENSE`](./LICENSE). The `@monolithlabs-hub/wallet-connect-core` package additionally ports a small set of files from the [`@solana/wallet-adapter`](https://github.com/anza-xyz/wallet-adapter) ecosystem (Apache-2.0); per-file attribution headers and the consolidated list live in [`NOTICE`](./NOTICE) and [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md), both of which ship inside the published `core` tarball.

## Theming the modal

`<ConnectButton>` reads every visual value from a CSS custom property with an inline `var(--wc-foo, fallback)` fallback. Set the variable on `:root`, on `[role="dialog"]`, on `[data-wc-modal]`, or on any ancestor — the cascade flows through. Hover and focus-visible rules are injected once into `<head>` by `attachModal()` from `@monolithlabs-hub/wallet-connect-ui`.

| Variable             | Default                          | Where it applies                         |
| -------------------- | -------------------------------- | ---------------------------------------- |
| `--wc-bg`            | `#fff`                           | Dialog background                        |
| `--wc-fg`            | `#111`                           | Dialog foreground (text)                 |
| `--wc-accent`        | `#5b5bd6`                        | Focus-visible outline                    |
| `--wc-muted-fg`      | `rgba(0, 0, 0, 0.6)`             | Close button, "Connecting…" status text  |
| `--wc-border`        | `rgba(0, 0, 0, 0.08)`            | Header divider, disconnect button border |
| `--wc-radius`        | `12px`                           | Dialog border-radius                     |
| `--wc-radius-item`   | `8px`                            | Wallet rows, close button, badges        |
| `--wc-backdrop`      | `rgba(0, 0, 0, 0.5)`             | Modal backdrop                           |
| `--wc-shadow`        | `0 20px 40px rgba(0, 0, 0, 0.3)` | Dialog box-shadow                        |
| `--wc-badge-bg`      | `rgba(0, 0, 0, 0.08)`            | "Get" / "Install" badge background       |
| `--wc-badge-fg`      | `inherit`                        | "Get" / "Install" badge text             |
| `--wc-detected-bg`   | `rgba(34, 197, 94, 0.12)`        | "Detected" badge background              |
| `--wc-detected-fg`   | `rgb(21, 128, 61)`               | "Detected" badge text                    |
| `--wc-item-hover-bg` | `rgba(0, 0, 0, 0.04)`            | Wallet row hover, close button hover     |
| `--wc-error-bg`      | `rgba(220, 38, 38, 0.08)`        | Error row background                     |
| `--wc-error-fg`      | `rgb(185, 28, 28)`               | Error row text                           |
| `--wc-font-size`     | `14px`                           | Body text                                |
| `--wc-title-size`    | `18px`                           | Modal title                              |

Dark-mode example:

```css
:root {
  --wc-bg: #0f1115;
  --wc-fg: #f5f5f7;
  --wc-muted-fg: rgba(255, 255, 255, 0.6);
  --wc-border: rgba(255, 255, 255, 0.08);
  --wc-badge-bg: rgba(255, 255, 255, 0.08);
  --wc-detected-bg: rgba(34, 197, 94, 0.18);
  --wc-detected-fg: rgb(74, 222, 128);
  --wc-item-hover-bg: rgba(255, 255, 255, 0.06);
}
```
