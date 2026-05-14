<script setup lang="ts">
import type { WalletManagerConfig } from '@monolithlabs-hub/wallet-connect-core'
import { ConnectButton } from '@monolithlabs-hub/wallet-connect-vue'
import { computed, onMounted, onUnmounted, ref, type CSSProperties } from 'vue'

import DemoProvider from './components/DemoProvider.vue'
import WalletInfo from './components/WalletInfo.vue'
import { OPINDEX, PHANTOM, SOLFLARE } from './wallets'

/**
 * Four demos, one hash-routed page — mirrors `examples/react-example`.
 * Each demo nests under its own `<DemoProvider>` so the `WalletManagerConfig`
 * for each scenario is fully isolated (one manager per active route;
 * destroyed when the route changes).
 *
 * - `#basic`    — minimal connect button, `requireSignIn: false`.
 * - `#siws`     — adds SIWS sign-in (`requireSignIn: true`), shows the
 *                 returned signature inline.
 * - `#priority` — Solflare priority 1, Phantom 2, Opindex 3 — visible on
 *                 desktop without the Opindex extension.
 * - `#neutral`  — `pinnedWallet: null` disables the Opindex pin entirely,
 *                 so the list sorts by `priority` alone.
 *
 * Default route is `#basic`.
 */

type Route = 'basic' | 'siws' | 'priority' | 'neutral'

const ROUTES: ReadonlyArray<{ id: Route; label: string }> = [
  { id: 'basic', label: 'Basic' },
  { id: 'siws', label: 'SIWS sign-in' },
  { id: 'priority', label: 'Custom priority' },
  { id: 'neutral', label: 'Neutral (no pin)' },
]

function parseRoute(hash: string): Route {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash
  return ROUTES.some((r) => r.id === stripped) ? (stripped as Route) : 'basic'
}

function initialRoute(): Route {
  // SSR guard: `window` is undefined on the server. The hashchange
  // listener registers in `onMounted`, which only fires on the client.
  if (typeof window === 'undefined') return 'basic'
  return parseRoute(window.location.hash)
}

const route = ref<Route>(initialRoute())

function handleHashChange(): void {
  route.value = parseRoute(window.location.hash)
}

onMounted(() => {
  window.addEventListener('hashchange', handleHashChange)
})
onUnmounted(() => {
  window.removeEventListener('hashchange', handleHashChange)
})

// --- Demo configs (module-scope shape; defined here so each one sits next
//     to the demo description it powers). All four configs are stable
//     references for as long as the component lives. ---

const basicConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  // requireSignIn: false → the flow lands at `authenticated` immediately
  // after the wallet returns a public key. No SIWS sign step.
  requireSignIn: false,
}

const siwsConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  // requireSignIn: true chains an SIWS signature onto the connect flow.
  // States: `connecting → connected → signing → authenticated`. On mobile
  // the SIWS message is bundled into the connect deep link (one round
  // trip); on desktop the wallet shows a second sign prompt.
  requireSignIn: true,
  // The signed message body. The PUBLIC KEY is interpolated on desktop;
  // on mobile this is called with `''` because the public key isn't
  // known when the deep link is built (the wallet substitutes its own
  // address per the SIWS spec's optional `address` field). Consumers
  // should handle the empty-arg case.
  signInMessage: (publicKey) =>
    publicKey === ''
      ? 'Sign in to the wallet-connect example.'
      : `Sign in to wallet-connect example.\nAccount: ${publicKey}`,
  onAuthenticated: (publicKey, signature) => {
    // eslint-disable-next-line no-console
    console.log('[example/siws] authenticated', { publicKey, signature })
  },
}

const priorityConfig: WalletManagerConfig = {
  // Solflare priority 1, Phantom 2, Opindex 3. Lower numbers sort first
  // among non-pinned wallets. On desktop *without* the Opindex extension
  // the list reads Solflare → Phantom → Opindex (last because Opindex's
  // pin is suppressed). On mobile (or desktop with the Opindex extension)
  // the Opindex pin still wins index 0, then the remainder sorts by
  // priority.
  wallets: [
    { ...OPINDEX, priority: 3 },
    { ...PHANTOM, priority: 2 },
    { ...SOLFLARE, priority: 1 },
  ],
  requireSignIn: false,
}

const neutralConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  // `pinnedWallet: null` disables the platform-aware pin entirely. The
  // default is `'opindex'`; pass `null` for fully neutral mode where the
  // list sorts by `priority` only and no wallet is forced to index 0.
  pinnedWallet: null,
  requireSignIn: false,
}

// Single Route → copy lookup keeps `activeTitle` and `activeDescription`
// exhaustive at the type level: `Record<Route, …>` forces TS to flag a
// missing branch if a new Route variant is added without updating the
// copy. Switch statements over a union are TS-checked for assignment
// returns but not for missing cases.
const ROUTE_COPY: Record<Route, { title: string; description: string }> = {
  basic: {
    title: 'Basic connect',
    description:
      'Default configuration — three wallets, Opindex pinning enabled, no sign-in step. Once the wallet returns a public key, the flow lands in `authenticated`.',
  },
  siws: {
    title: 'Connect with Sign-In With Solana',
    description:
      '`requireSignIn: true` chains a SIWS signature onto the connect flow. The modal stays open through the signing step; on mobile the SIWS message is bundled into the connect deep link for wallets that consume it.',
  },
  priority: {
    title: 'Custom wallet priority',
    description:
      '`WalletConfig.priority` orders non-pinned wallets ascending. Here Solflare is priority 1, Phantom 2, Opindex 3 — Solflare leads on desktop without the Opindex extension; on mobile the Opindex pin still wins index 0.',
  },
  neutral: {
    title: 'Neutral mode (no Opindex pinning)',
    description:
      '`pinnedWallet: null` disables the Opindex pin everywhere — including mobile. The wallet list sorts purely by priority. Use this in consumer dapps that want to surface wallets neutrally.',
  },
}

const activeTitle = computed(() => ROUTE_COPY[route.value].title)
const activeDescription = computed(() => ROUTE_COPY[route.value].description)

// --- Inline default styling --------------------------------------------

const mainStyle: CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: '720px',
  margin: '0 auto',
  padding: 'clamp(16px, 4vw, 32px)',
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 'clamp(20px, 5vw, 28px)',
  letterSpacing: '-0.02em',
}

const leadStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(0, 0, 0, 0.7)',
  lineHeight: 1.5,
}

const navStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  marginTop: '4px',
}

const navLinkBase: CSSProperties = {
  padding: '6px 12px',
  borderRadius: '999px',
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: 'rgba(0, 0, 0, 0.12)',
  color: 'rgba(0, 0, 0, 0.7)',
  textDecoration: 'none',
  fontSize: '14px',
  background: 'transparent',
}

const navLinkActive: CSSProperties = {
  background: '#111',
  color: '#fff',
  borderColor: '#111',
}

function navLinkStyle(id: Route): CSSProperties {
  return route.value === id ? { ...navLinkBase, ...navLinkActive } : navLinkBase
}

const sectionStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  padding: '20px',
  borderRadius: '12px',
  borderStyle: 'solid',
  borderWidth: '1px',
  borderColor: 'rgba(0, 0, 0, 0.08)',
  background: 'rgba(0, 0, 0, 0.02)',
}

const sectionTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: '18px',
  fontWeight: 600,
}

const sectionDescStyle: CSSProperties = {
  margin: 0,
  color: 'rgba(0, 0, 0, 0.7)',
  fontSize: '14px',
  lineHeight: 1.5,
}

const sectionBodyStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
  alignItems: 'flex-start',
}
</script>

<template>
  <main :style="mainStyle">
    <header :style="headerStyle">
      <h1 :style="titleStyle">wallet-connect example (Vue)</h1>
      <p :style="leadStyle">
        Live demos of <code>@monolithlabs-hub/wallet-connect-vue</code>. Pick a scenario from the
        navigation, click <strong>Connect Wallet</strong>, and watch the flow state update
        inline.
      </p>
      <nav :style="navStyle" aria-label="Demos">
        <a
          v-for="r in ROUTES"
          :key="r.id"
          :href="`#${r.id}`"
          :data-route="r.id"
          :aria-current="route === r.id ? 'page' : undefined"
          :style="navLinkStyle(r.id)"
        >
          {{ r.label }}
        </a>
      </nav>
    </header>

    <section :style="sectionStyle">
      <h2 :style="sectionTitleStyle">{{ activeTitle }}</h2>
      <p :style="sectionDescStyle">{{ activeDescription }}</p>
      <div :style="sectionBodyStyle">
        <DemoProvider v-if="route === 'basic'" :config="basicConfig">
          <ConnectButton />
          <WalletInfo />
        </DemoProvider>
        <DemoProvider v-else-if="route === 'siws'" :config="siwsConfig">
          <ConnectButton />
          <WalletInfo />
        </DemoProvider>
        <DemoProvider v-else-if="route === 'priority'" :config="priorityConfig">
          <ConnectButton />
          <WalletInfo />
        </DemoProvider>
        <DemoProvider v-else-if="route === 'neutral'" :config="neutralConfig">
          <ConnectButton />
          <WalletInfo />
        </DemoProvider>
      </div>
    </section>
  </main>
</template>
