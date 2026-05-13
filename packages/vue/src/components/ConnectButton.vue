<script setup lang="ts">
import {
  detectPlatform,
  type FlowState,
  type PlatformInfo,
  type WalletConfig,
} from '@monolithlabs/wallet-connect-core'
import {
  attachModal,
  getDialogAttributes,
  getInstallBadge,
  truncatePublicKey,
  type InstallBadge,
  type ModalHandle,
} from '@monolithlabs/wallet-connect-ui'
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
 * Mirrors `@monolithlabs/wallet-connect-react`'s `<ConnectButton>` in
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
 * `@monolithlabs/wallet-connect-ui`'s `attachModal`. This component owns
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
  error,
  disconnecting,
  connect,
  disconnect,
} = useWallet()

const open = ref(false)
// Platform is read once per mount and cached. `detectPlatform()` reads
// `navigator`; it's SSR-safe (returns `install-prompt` on the server).
const platform = ref<PlatformInfo>(detectPlatform())
const titleId = useId()
const dialogRef = useTemplateRef<HTMLDivElement>('dialog')

const PINNED_WALLET_ID = 'opindex'

function isFlowStateConnected(state: FlowState): boolean {
  return state === 'connected' || state === 'signing' || state === 'authenticated'
}

/**
 * Compute the install-prompt badge label for a wallet row, or `null` to
 * omit. Thin wrapper around `getInstallBadge` from `wallet-connect-ui`.
 */
function badgeFor(walletConfig: WalletConfig): InstallBadge | null {
  const shouldShow =
    walletConfig.id === PINNED_WALLET_ID &&
    (platform.value.isMobile || !platform.value.hasOpindexExtension)
  return getInstallBadge({ shouldShow, isIOS: platform.value.isIOS })
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

// ---- Inline default styling -------------------------------------------
// Minimal — consumer overrides via class / style on the root button or
// targets the dialog with standard ARIA selectors. TASK-401 will move
// these into the headless UI package.

const modalBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: '0',
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalContentStyle: CSSProperties = {
  background: '#fff',
  color: '#111',
  borderRadius: '12px',
  minWidth: '320px',
  maxWidth: 'min(420px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
  boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
}

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid rgba(0,0,0,0.08)',
}

const modalTitleStyle: CSSProperties = { margin: '0', fontSize: '18px' }

const modalCloseButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: '22px',
  lineHeight: '1',
  cursor: 'pointer',
  padding: '4px',
}

const walletListStyle: CSSProperties = {
  listStyle: 'none',
  margin: '0',
  padding: '8px',
  display: 'flex',
  flexDirection: 'column',
  gap: '4px',
}

const walletItemButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  width: '100%',
  padding: '10px 12px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: '8px',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
}

const walletIconPlaceholderStyle: CSSProperties = {
  display: 'inline-block',
  width: '24px',
  height: '24px',
  borderRadius: '4px',
  background: 'rgba(0,0,0,0.08)',
}

const walletBadgeStyle: CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: '999px',
  background: 'rgba(0,0,0,0.08)',
}

const walletStatusStyle: CSSProperties = {
  fontSize: '12px',
  color: 'rgba(0,0,0,0.6)',
}

const errorRowStyle: CSSProperties = {
  margin: '8px 12px 0',
  padding: '8px 12px',
  borderRadius: '8px',
  background: 'rgba(220, 38, 38, 0.08)',
  color: 'rgb(185, 28, 28)',
  fontSize: '13px',
}

const disconnectButtonStyle: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: '8px',
  background: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
}

const connectedViewStyle: CSSProperties = {
  padding: '12px 16px',
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
    <div
      v-if="open"
      role="presentation"
      :style="modalBackdropStyle"
      @click="handleBackdropClick"
    >
      <div ref="dialog" v-bind="dialogAttrs" :style="modalContentStyle">
        <header :style="modalHeaderStyle">
          <h2 :id="titleId" :style="modalTitleStyle">{{ modalTitle }}</h2>
          <button
            type="button"
            aria-label="Close"
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
                  :style="{ borderRadius: '4px' }"
                />
                <span v-else aria-hidden="true" :style="walletIconPlaceholderStyle" />
                <span :style="{ flex: 1, textAlign: 'left' }">{{ w.name }}</span>
                <span
                  v-if="state === 'connecting' && activeWallet?.id === w.id"
                  :style="walletStatusStyle"
                >
                  Connecting…
                </span>
                <span v-if="badgeFor(w)" :style="walletBadgeStyle">
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
