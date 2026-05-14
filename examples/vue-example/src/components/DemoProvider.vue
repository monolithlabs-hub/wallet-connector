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
 *
 * **Caveat:** the manager is built once in `setup()` from the initial
 * `props.config` value. Swapping the `config` prop to a new object at
 * runtime is NOT supported — the old manager keeps running with the old
 * config. The example app's demo configs are module-scope (stable
 * identity), so this isn't an issue here. A consumer who needs swap-on-
 * change semantics should mirror the React `<WalletConnectProvider>`'s
 * pattern of destroying + recreating on identity change.
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
