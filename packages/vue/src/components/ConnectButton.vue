<script setup lang="ts">
import {
  detectPlatform,
  type FlowState,
  type PlatformInfo,
  type WalletConfig,
} from '@monolithlabs/wallet-connect-core'
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
 * footgun with `position: fixed` inside CSS-transformed parents). The
 * Vue parity for React's "TASK-401 will give us a portal" caveat.
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

const wallet = useWallet()
const open = ref(false)
// Platform is read once per mount and cached. `detectPlatform()` reads
// `navigator`; it's SSR-safe (returns `install-prompt` on the server).
const platform = ref<PlatformInfo>(detectPlatform())
const titleId = useId()
const dialogRef = useTemplateRef<HTMLDivElement>('dialog')

const PINNED_WALLET_ID = 'opindex'

function truncatePublicKey(pubkey: string, head = 4, tail = 4): string {
  if (pubkey.length <= head + tail) return pubkey
  return `${pubkey.slice(0, head)}…${pubkey.slice(-tail)}`
}

function isFlowStateConnected(state: FlowState): boolean {
  return state === 'connected' || state === 'signing' || state === 'authenticated'
}

function badgeFor(walletConfig: WalletConfig): 'Get' | 'Install' | null {
  if (walletConfig.id !== PINNED_WALLET_ID) return null
  if (platform.value.isMobile) return 'Get'
  if (!platform.value.hasOpindexExtension) return 'Install'
  return null
}

const truncated = computed<string | null>(() =>
  wallet.publicKey.value ? truncatePublicKey(wallet.publicKey.value) : null,
)
const isConnected = computed(() => isFlowStateConnected(wallet.state.value))
const buttonLabel = computed(() =>
  isConnected.value ? (truncated.value ?? props.connectedLabel) : props.label,
)
const buttonAriaLabel = computed(() =>
  isConnected.value ? `Wallet menu — connected as ${truncated.value ?? 'unknown'}` : props.label,
)
const modalTitle = computed(() => (isConnected.value ? 'Connected' : 'Select a wallet'))
const walletItemsDisabled = computed(
  () => wallet.state.value === 'connecting' || wallet.state.value === 'signing',
)

// Transition watcher for `connected` / `authenticated` emits + auto-close.
//
// Auto-closes on the `authenticated` transition rather than on
// `connected`. For `requireSignIn: false` flows the FlowMachine
// auto-steps `connected → authenticated` in the same dispatch, so the
// close timing is unchanged. For `requireSignIn: true` flows the modal
// stays open through the `signing` state — the user keeps seeing the
// dialog while their wallet shows a sign prompt.
let prevState: FlowState = wallet.state.value
watch(wallet.state, (curr) => {
  const prev = prevState
  prevState = curr

  const wasConnected = isFlowStateConnected(prev)
  const isNowConnected = isFlowStateConnected(curr)

  if (!wasConnected && isNowConnected && wallet.publicKey.value) {
    emit('connected', wallet.publicKey.value)
  }

  if (prev !== 'authenticated' && curr === 'authenticated') {
    if (wallet.publicKey.value && wallet.signature.value) {
      emit('authenticated', wallet.publicKey.value, wallet.signature.value)
    }
    open.value = false
  }
})

async function handleSelectWallet(walletId: string): Promise<void> {
  try {
    await wallet.connect(walletId)
  } catch {
    // Errors land on wallet.error; the modal renders that branch.
  }
}

async function handleDisconnect(): Promise<void> {
  try {
    await wallet.disconnect()
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

// ---- Focus trap + restoration ------------------------------------------

let previouslyFocused: HTMLElement | null = null

function getFocusable(): HTMLElement[] {
  const root = dialogRef.value
  if (!root) return []
  const selector =
    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  return Array.from(root.querySelectorAll<HTMLElement>(selector))
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  const root = dialogRef.value
  if (!root) return

  if (event.key === 'Escape') {
    event.preventDefault()
    open.value = false
    return
  }
  if (event.key !== 'Tab') return

  const items = getFocusable()
  if (items.length === 0) {
    event.preventDefault()
    return
  }
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  const active = document.activeElement as HTMLElement | null

  if (event.shiftKey) {
    if (active === first || !root.contains(active)) {
      event.preventDefault()
      last.focus()
    }
  } else {
    if (active === last || !root.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }
}

// Manage focus + the keydown listener as `open` toggles. Mirrors React's
// `useEffect` on `open` but split into the two transitions Vue's `watch`
// gives us by default.
watch(open, async (isOpen) => {
  if (isOpen) {
    previouslyFocused = (typeof document !== 'undefined'
      ? (document.activeElement as HTMLElement | null)
      : null)
    document.addEventListener('keydown', handleKeydown)
    // Wait for `<Teleport>` to commit so the dialog ref is populated
    // before reading focusables out of it.
    await nextTick()
    getFocusable()[0]?.focus()
  } else {
    document.removeEventListener('keydown', handleKeydown)
    previouslyFocused?.focus?.()
    previouslyFocused = null
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
})

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
      <div
        ref="dialog"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :style="modalContentStyle"
      >
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
          <div
            v-if="isConnected && wallet.publicKey.value"
            :style="connectedViewStyle"
          >
            <p v-if="wallet.wallet.value" :style="{ margin: '0', fontWeight: 600 }">
              {{ wallet.wallet.value.name }}
            </p>
            <p :style="{ margin: '0', fontFamily: 'monospace', wordBreak: 'break-all' }">
              {{ wallet.publicKey.value }}
            </p>
            <button
              type="button"
              :disabled="wallet.disconnecting.value"
              :style="disconnectButtonStyle"
              @click="handleDisconnect"
            >
              {{ wallet.disconnecting.value ? 'Disconnecting…' : 'Disconnect' }}
            </button>
          </div>
          <!-- Wallet list -->
          <ul
            v-else-if="wallet.sortedWallets.value.length > 0"
            role="list"
            :style="walletListStyle"
          >
            <li v-for="w in wallet.sortedWallets.value" :key="w.id" :style="{ margin: '0' }">
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
                <span
                  v-else
                  aria-hidden="true"
                  :style="walletIconPlaceholderStyle"
                />
                <span :style="{ flex: 1, textAlign: 'left' }">{{ w.name }}</span>
                <span
                  v-if="
                    wallet.state.value === 'connecting' &&
                    wallet.wallet.value?.id === w.id
                  "
                  :style="walletStatusStyle"
                >
                  Connecting…
                </span>
                <span v-if="badgeFor(w)" :style="walletBadgeStyle">
                  {{ badgeFor(w) }}
                </span>
              </button>
            </li>
            <li
              v-if="wallet.error.value?.message"
              role="alert"
              :style="errorRowStyle"
            >
              {{ wallet.error.value.message }}
            </li>
          </ul>
          <p v-else :style="{ padding: '12px 16px', margin: '0' }">
            No wallets configured.
          </p>
        </div>
      </div>
    </div>
  </Teleport>
</template>
