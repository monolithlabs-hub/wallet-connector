<script setup lang="ts">
import {
  createWalletManager,
  type WalletManagerConfig,
} from '@monolithlabs/wallet-connect-core'
import { WalletConnectInjectionKey } from '@monolithlabs/wallet-connect-vue'
import { onUnmounted, provide } from 'vue'

/**
 * Per-demo manager scope. Mirrors `<WalletConnectProvider>` from the
 * React example, scoped to one component subtree.
 *
 * The library also ships a `WalletConnectPlugin` (`app.use(...)`) that
 * installs a single manager at the *app* level — the right choice for a
 * typical dapp with one wallet config. This example has four scenarios
 * with different configs, so each demo uses its own component-scoped
 * provider via `provide(WalletConnectInjectionKey, manager)`. Each Vue
 * component instance gets its own `WalletManager` for its lifetime; the
 * shell mounts/unmounts demos on hash-route change, so a `RouteX → RouteY`
 * navigation destroys the prior manager and stands up a fresh one.
 */

const props = defineProps<{
  config: WalletManagerConfig
}>()

const manager = createWalletManager(props.config)

provide(WalletConnectInjectionKey, manager)

onUnmounted(() => {
  manager.destroy()
})
</script>

<template>
  <slot />
</template>
