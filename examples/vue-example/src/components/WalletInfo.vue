<script setup lang="ts">
import { useWallet } from '@monolithlabs-hub/wallet-connect-vue'
import type { CSSProperties } from 'vue'

/**
 * Inline read-only display of the live wallet flow state. Mirrors the
 * React example's `WalletInfo`. Surfaces the connected public key + SIWS
 * signature directly on the page — the `<ConnectButton>` already shows
 * them inside its modal, but having them inline makes the demo behavior
 * obvious without a click.
 */

const { state, wallet, publicKey, signature, error } = useWallet()

const dtStyle: CSSProperties = {
  margin: 0,
  fontWeight: 600,
  color: 'rgba(0, 0, 0, 0.6)',
}

const ddStyle: CSSProperties = {
  margin: 0,
}

const monoStyle: CSSProperties = {
  ...ddStyle,
  fontFamily: 'monospace',
}

const errStyle: CSSProperties = {
  ...ddStyle,
  color: 'rgb(185, 28, 28)',
}

const listStyle: CSSProperties = {
  margin: 0,
  display: 'grid',
  gridTemplateColumns: 'max-content 1fr',
  gap: '4px 12px',
  fontSize: '14px',
  wordBreak: 'break-all',
}
</script>

<template>
  <dl v-if="state !== 'idle'" :style="listStyle">
    <dt :style="dtStyle">state</dt>
    <dd :style="ddStyle"><code>{{ state }}</code></dd>

    <template v-if="wallet">
      <dt :style="dtStyle">wallet</dt>
      <dd :style="ddStyle">{{ wallet.name }}</dd>
    </template>

    <template v-if="publicKey">
      <dt :style="dtStyle">publicKey</dt>
      <dd :style="monoStyle">{{ publicKey }}</dd>
    </template>

    <template v-if="signature">
      <dt :style="dtStyle">signature</dt>
      <dd :style="monoStyle">{{ signature }}</dd>
    </template>

    <template v-if="error">
      <dt :style="dtStyle">error</dt>
      <dd :style="errStyle">{{ error.message }}</dd>
    </template>
  </dl>
</template>
