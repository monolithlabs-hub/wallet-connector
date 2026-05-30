<script setup lang="ts">
import { type FlowState, type WalletListEntry } from '@monolithlabs-hub/wallet-connect-core'
import {
  attachModal,
  getDialogAttributes,
  getStatusBadge,
  getWalletStatus,
  truncatePublicKey,
  type ModalHandle,
  type StatusBadge,
  type WalletStatus,
} from '@monolithlabs-hub/wallet-connect-ui'
import {
  computed,
  nextTick,
  onUnmounted,
  ref,
  useId,
  useTemplateRef,
  watch,
  type CSSProperties,
} from 'vue'

import { useWallet } from '../composables/use-wallet'

/**
 * Ready-to-use Vue 3 component that runs the full wallet connect flow.
 *
 * Mirrors `@monolithlabs-hub/wallet-connect-react`'s `<ConnectButton>` in
 * behavior — same modal shell, focus trap, ARIA, and badge logic —
 * implemented as a Vue 3 single-file component using `<script setup>`.
 *
 * **Class / style forwarding**: Vue automatically forwards non-prop
 * attributes to the root element, so `<ConnectButton class="..." style="...">`
 * applies to the rendered `<button>` without needing explicit `class` /
 * `style` props. No `inheritAttrs: false` here.
 *
 * **Modal placement**: rendered into `document.body` via `<Teleport>` so
 * the modal isn't clipped by transformed ancestor containers (a common
 * footgun with `position: fixed` inside CSS-transformed parents).
 *
 * **Modal lifecycle** (focus trap, initial focus, focus restoration on
 * close, body scroll lock, Escape handler): delegated to
 * `@monolithlabs-hub/wallet-connect-ui`'s `attachModal`. This component owns
 * the JSX shape, the open/close state, and the inline default styling
 * only.
 */

const props = withDefaults(
  defineProps<{
    /** Label on the button when disconnected. Default: "Connect Wallet". */
    label?: string
    /**
     * Fallback label on the button when the flow is in a connected /
     * signing / authenticated state but no public key is available to
     * truncate. The FlowMachine sets publicKey before transitioning to
     * `connected`, so the visible label is normally the truncated key
     * — this is the safety net.
     */
    connectedLabel?: string
  }>(),
  {
    label: 'Connect Wallet',
    connectedLabel: 'Connected',
  },
)

const emit = defineEmits<{
  /** Fires once when the connect flow completes successfully. */
  connected: [publicKey: string]
  /**
   * Fires once when SIWS sign-in completes successfully. Only fires for
   * managers configured with `requireSignIn: true`.
   */
  authenticated: [publicKey: string, signature: string]
}>()

// Destructure the composable return so `<template>` can auto-unwrap the
// refs (Vue only auto-unwraps top-level refs — `wallet.publicKey` would
// stay wrapped, but `publicKey` doesn't). `wallet` is renamed to
// `activeWallet` to avoid shadowing the composable itself.
const {
  state,
  publicKey,
  signature,
  wallet: activeWallet,
  sortedWallets,
  platform,
  error,
  disconnecting,
  connect,
  disconnect,
} = useWallet()

const open = ref(false)
const titleId = useId()
const dialogRef = useTemplateRef<HTMLDivElement>('dialog')

const PINNED_WALLET_ID = 'opindex'

function isFlowStateConnected(state: FlowState): boolean {
  return state === 'connected' || state === 'signing' || state === 'authenticated'
}

/**
 * Per-row badge decision. Mirrors the React `<ConnectButton>` logic:
 * detected wallets get "Detected", the pinned wallet without an
 * extension gets "Get"/"Install", everything else gets nothing.
 */
function badgeFor(walletEntry: WalletListEntry): StatusBadge | null {
  const status: WalletStatus = getWalletStatus({
    isConnected: false,
    isDetected: walletEntry.isDetected,
  })
  const effective = status === 'install' && walletEntry.id !== PINNED_WALLET_ID ? null : status
  if (effective === null) return null
  return getStatusBadge({ status: effective, isIOS: platform.value.isIOS })
}

function initialFor(name: string): string {
  const trimmed = name.trim()
  if (trimmed.length === 0) return '?'
  return trimmed.charAt(0).toUpperCase()
}

const truncated = computed<string | null>(() =>
  publicKey.value ? truncatePublicKey(publicKey.value) : null,
)
const isConnected = computed(() => isFlowStateConnected(state.value))
const buttonLabel = computed(() =>
  isConnected.value ? (truncated.value ?? props.connectedLabel) : props.label,
)
const buttonAriaLabel = computed(() =>
  isConnected.value ? `Wallet menu — connected as ${truncated.value ?? 'unknown'}` : props.label,
)
const modalTitle = computed(() => (isConnected.value ? 'Connected' : 'Select a wallet'))
const walletItemsDisabled = computed(
  () => state.value === 'connecting' || state.value === 'signing',
)

// Transition watcher for `connected` / `authenticated` emits + auto-close.
//
// Auto-closes on the `authenticated` transition rather than on
// `connected`. For `requireSignIn: false` flows the FlowMachine
// auto-steps `connected → authenticated` in the same dispatch, so the
// close timing is unchanged. For `requireSignIn: true` flows the modal
// stays open through the `signing` state — the user keeps seeing the
// dialog while their wallet shows a sign prompt.
let prevState: FlowState = state.value
watch(state, (curr) => {
  const prev = prevState
  prevState = curr

  const wasConnected = isFlowStateConnected(prev)
  const isNowConnected = isFlowStateConnected(curr)

  if (!wasConnected && isNowConnected && publicKey.value) {
    emit('connected', publicKey.value)
  }

  if (prev !== 'authenticated' && curr === 'authenticated') {
    if (publicKey.value && signature.value) {
      emit('authenticated', publicKey.value, signature.value)
    }
    open.value = false
  }
})

async function handleSelectWallet(walletId: string): Promise<void> {
  try {
    await connect(walletId)
  } catch {
    // Errors land on `error`; the modal renders that branch.
  }
}

async function handleDisconnect(): Promise<void> {
  try {
    await disconnect()
  } catch {
    // Best-effort. The FlowMachine RESET runs unconditionally.
  }
  open.value = false
}

function handleBackdropClick(event: MouseEvent): void {
  if (event.target === event.currentTarget) {
    open.value = false
  }
}

// ---- Modal lifecycle (delegated to attachModal) ------------------------

let modalHandle: ModalHandle | null = null

watch(open, async (isOpen) => {
  if (isOpen) {
    // Wait for `<Teleport>` to commit so the dialog ref is populated
    // before attachModal queries it for focusables.
    await nextTick()
    if (dialogRef.value) {
      modalHandle = attachModal({
        root: dialogRef.value,
        onRequestClose: () => {
          open.value = false
        },
      })
    }
  } else {
    modalHandle?.destroy()
    modalHandle = null
  }
})

onUnmounted(() => {
  modalHandle?.destroy()
  modalHandle = null
})

const dialogAttrs = computed(() => getDialogAttributes(titleId))

// ---- Default styling --------------------------------------------------
// Every visual value reads from a CSS custom property (`var(--wc-foo,
// fallback)`) so consumers can theme via `[role="dialog"]`,
// `[data-wc-modal]`, a parent element, or `:root`. The
// `@monolithlabs-hub/wallet-connect-ui` package injects the variable
// defaults and the hover / focus-visible / disabled rules on first
// `attachModal` call.

const modalBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: '0',
  background: 'var(--wc-backdrop, rgba(0, 0, 0, 0.5))',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalContentStyle: CSSProperties = {
  background: 'var(--wc-bg, #fff)',
  color: 'var(--wc-fg, #111)',
  borderRadius: 'var(--wc-radius, 12px)',
  minWidth: '320px',
  maxWidth: 'min(420px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
  boxShadow: 'var(--wc-shadow, 0 20px 40px rgba(0, 0, 0, 0.3))',
}

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '14px 18px',
  borderBottom: '1px solid var(--wc-border, rgba(0, 0, 0, 0.08))',
}

const modalTitleStyle: CSSProperties = {
  margin: '0',
  fontSize: 'var(--wc-title-size, 18px)',
  fontWeight: 600,
  letterSpacing: '-0.01em',
}

const modalCloseButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '22px',
  lineHeight: '1',
  cursor: 'pointer',
  padding: '6px',
  borderRadius: 'var(--wc-radius-item, 8px)',
  color: 'var(--wc-muted-fg, rgba(0, 0, 0, 0.6))',
}

const walletListStyle: CSSProperties = {
  listStyle: 'none',
  margin: '0',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
}

const walletItemButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '10px 12px',
  background: 'transparent',
  border: 'none',
  borderRadius: 'var(--wc-radius-item, 8px)',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
  textAlign: 'left',
}

const walletIconStyle: CSSProperties = {
  borderRadius: '6px',
  display: 'block',
  flexShrink: 0,
}

const walletIconFallbackStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  borderRadius: '6px',
  background: 'var(--wc-badge-bg, rgba(0, 0, 0, 0.08))',
  color: 'var(--wc-muted-fg, rgba(0, 0, 0, 0.6))',
  fontSize: '12px',
  fontWeight: 600,
  flexShrink: 0,
}

const walletBadgeStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '999px',
  background: 'var(--wc-badge-bg, rgba(0, 0, 0, 0.08))',
  color: 'var(--wc-badge-fg, inherit)',
}

const walletDetectedBadgeStyle: CSSProperties = {
  ...walletBadgeStyle,
  background: 'var(--wc-detected-bg, rgba(34, 197, 94, 0.12))',
  color: 'var(--wc-detected-fg, rgb(21, 128, 61))',
}

const walletStatusStyle: CSSProperties = {
  fontSize: '12px',
  color: 'var(--wc-muted-fg, rgba(0, 0, 0, 0.6))',
}

const errorRowStyle: CSSProperties = {
  margin: '8px 12px 0',
  padding: '8px 12px',
  borderRadius: 'var(--wc-radius-item, 8px)',
  background: 'var(--wc-error-bg, rgba(220, 38, 38, 0.08))',
  color: 'var(--wc-error-fg, rgb(185, 28, 28))',
  fontSize: '13px',
}

const disconnectButtonStyle: CSSProperties = {
  padding: '10px 14px',
  border: '1px solid var(--wc-border, rgba(0, 0, 0, 0.12))',
  borderRadius: 'var(--wc-radius-item, 8px)',
  background: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
  fontWeight: 500,
}

const connectedViewStyle: CSSProperties = {
  padding: '14px 18px',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
}
</script>

<template>
  <button
    type="button"
    aria-haspopup="dialog"
    :aria-expanded="open"
    :aria-label="buttonAriaLabel"
    @click="open = true"
  >
    {{ buttonLabel }}
  </button>

  <Teleport to="body">
    <div v-if="open" role="presentation" :style="modalBackdropStyle" @click="handleBackdropClick">
      <div ref="dialog" v-bind="dialogAttrs" data-wc-modal :style="modalContentStyle">
        <header :style="modalHeaderStyle">
          <h2 :id="titleId" :style="modalTitleStyle">{{ modalTitle }}</h2>
          <button
            type="button"
            aria-label="Close"
            data-wc-modal-close
            :style="modalCloseButtonStyle"
            @click="open = false"
          >
            ×
          </button>
        </header>
        <div>
          <!-- Connected view -->
          <div v-if="isConnected && publicKey" :style="connectedViewStyle">
            <p v-if="activeWallet" :style="{ margin: '0', fontWeight: 600 }">
              {{ activeWallet.name }}
            </p>
            <p :style="{ margin: '0', fontFamily: 'monospace', wordBreak: 'break-all' }">
              {{ publicKey }}
            </p>
            <button
              type="button"
              :disabled="disconnecting"
              :style="disconnectButtonStyle"
              @click="handleDisconnect"
            >
              {{ disconnecting ? 'Disconnecting…' : 'Disconnect' }}
            </button>
          </div>
          <!-- Wallet list -->
          <ul v-else-if="sortedWallets.length > 0" role="list" :style="walletListStyle">
            <li v-for="w in sortedWallets" :key="w.id" :style="{ margin: '0' }">
              <button
                type="button"
                :data-wallet-id="w.id"
                data-wc-wallet-item
                :disabled="walletItemsDisabled"
                :style="walletItemButtonStyle"
                @click="handleSelectWallet(w.id)"
              >
                <img
                  v-if="w.icon"
                  :src="w.icon"
                  alt=""
                  width="24"
                  height="24"
                  :style="walletIconStyle"
                />
                <span v-else aria-hidden="true" :style="walletIconFallbackStyle">
                  {{ initialFor(w.name) }}
                </span>
                <span :style="{ flex: 1, textAlign: 'left' }">{{ w.name }}</span>
                <span
                  v-if="state === 'connecting' && activeWallet?.id === w.id"
                  :style="walletStatusStyle"
                >
                  Connecting…
                </span>
                <span
                  v-if="badgeFor(w)"
                  :style="badgeFor(w) === 'Detected' ? walletDetectedBadgeStyle : walletBadgeStyle"
                >
                  {{ badgeFor(w) }}
                </span>
              </button>
            </li>
            <li v-if="error?.message" role="alert" :style="errorRowStyle">
              {{ error.message }}
            </li>
          </ul>
          <p v-else :style="{ padding: '12px 16px', margin: '0' }">No wallets configured.</p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
