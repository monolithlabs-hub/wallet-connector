import {
  WalletConnectionError,
  type FlowContext,
  type FlowState,
  type IdentifierString,
  type PlatformInfo,
  type SolanaSignAndSendTransactionOptions,
  type SolanaSignInInput,
  type SolanaSignInOutput,
  type WalletListEntry,
  type WalletError,
} from '@monolithlabs-hub/wallet-connect-core'
import { computed, onMounted, onUnmounted, ref, shallowRef, type ComputedRef, type Ref } from 'vue'

import { useWalletContext } from '../context/use-wallet-context'

/**
 * Return shape of {@link useWallet}.
 *
 * Mirrors `@monolithlabs-hub/wallet-connect-react`'s `useWallet` return where
 * the semantics overlap, with Vue-flavored reactivity wrappers: `Ref` for
 * read-write state, `ComputedRef` for everything else. The composable is
 * usable in `<script setup>` and the explicit `setup()` form alike.
 *
 * The `wallet` field is this library's {@link WalletListEntry} (display
 * metadata + runtime discovery flags) — not wallet-adapter's `Wallet`
 * (adapter wrapper).
 */
export interface UseWalletReturn {
  /** Reactive {@link FlowState}. Read-only from the consumer's POV. */
  state: Readonly<Ref<FlowState>>
  /** Connected public key, or `null` while disconnected. */
  publicKey: ComputedRef<string | null>
  /**
   * The SIWS signature returned by the wallet, base58-encoded. Set on the
   * `signing → authenticated` transition; cleared on RESET. `null` until a
   * `requireSignIn: true` flow completes.
   */
  signature: ComputedRef<string | null>
  /** The currently-selected or in-flight wallet's metadata, or `null`. */
  wallet: ComputedRef<WalletListEntry | null>
  /** Display-ready wallet list per the platform + pinnedWallet rules. */
  sortedWallets: ComputedRef<WalletListEntry[]>
  /**
   * Platform snapshot from the manager. `hasOpindexExtension` reflects
   * BOTH the legacy `window.opindex` sentinel AND the Wallet Standard
   * registry — see `WalletManager.getPlatform()`.
   */
  platform: ComputedRef<PlatformInfo>
  /** Last error seen in the flow, or `null`. Cleared on RESET. */
  error: ComputedRef<WalletError | null>

  // --- boolean state slices --------------------------------------------
  connecting: ComputedRef<boolean>
  connected: ComputedRef<boolean>
  /** True while a `disconnect()` is in flight. */
  disconnecting: Readonly<Ref<boolean>>
  /** Alias of {@link connecting}, kept for explicit-name preference. */
  isConnecting: ComputedRef<boolean>
  /** Alias of {@link connected}. */
  isConnected: ComputedRef<boolean>
  isSigning: ComputedRef<boolean>
  isAuthenticated: ComputedRef<boolean>

  // --- methods ----------------------------------------------------------
  select: (walletId: string) => void
  /**
   * Initiate a connect flow. Pass `walletId` directly, or call
   * {@link UseWalletReturn.select} first and `connect()` will read the
   * selection. Vue's refs update synchronously, so the
   * `select(); connect()` pattern works inside a single handler.
   */
  connect: (walletId?: string) => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signIn: (input?: SolanaSignInInput) => Promise<SolanaSignInOutput>
  /**
   * Sign a serialized transaction (raw bytes) with the connected wallet,
   * returning the signed, serialized transaction. Extension path only —
   * throws `WalletNotReadyError` on mobile deep-link. The chain defaults to
   * the configured cluster.
   */
  signTransaction: (transaction: Uint8Array, chain?: IdentifierString) => Promise<Uint8Array>
  /**
   * Sign and broadcast a serialized transaction (raw bytes), returning the
   * transaction signature bytes. Same platform constraints as
   * {@link UseWalletReturn.signTransaction}.
   */
  signAndSendTransaction: (
    transaction: Uint8Array,
    options?: { chain?: IdentifierString } & SolanaSignAndSendTransactionOptions,
  ) => Promise<{ signature: Uint8Array }>
}

/**
 * Vue 3 composable over a {@link WalletManager}.
 *
 * Reads the manager from the `WalletConnectInjectionKey` (set up by
 * `<WalletConnectPlugin>` in TASK-302). Subscribes to the manager during
 * setup (client-only — SSR-guarded) so the gap between setup and
 * `onMounted` doesn't miss any transitions; calls `manager.initialize()`
 * in `onMounted` to resume any pending mobile deep-link callback; and
 * unsubscribes in `onUnmounted`.
 *
 * Usable in both `<script setup>` and the explicit `setup()` function
 * form. SSR-safe: the subscribe is gated by `typeof window !==
 * 'undefined'` and `manager.initialize()` only runs on mount (never
 * during server rendering).
 */
export function useWallet(): UseWalletReturn {
  const manager = useWalletContext()

  // Source-of-truth refs. All three are updated together by the single
  // `manager.subscribe` callback below — one update path, computed refs
  // derive the public surface. `sortedWallets` is here too (not a
  // computed reading `manager.getSortedWallets()` directly) so its
  // re-evaluation is explicit and symmetric with state + context.
  const state = ref<FlowState>(manager.getState())
  const context = shallowRef<FlowContext>(manager.getContext())
  const sortedWalletsRef = shallowRef<WalletListEntry[]>(manager.getSortedWallets())
  const platformRef = shallowRef<PlatformInfo>(manager.getPlatform())

  // wallet-adapter compat: track the user-selected wallet (pre-connect)
  // separately from the in-flight / connected one. A plain `ref` is
  // sufficient — unlike React's setState, Vue's `ref.value = x` is
  // synchronous, so `connect()` called in the same handler as `select()`
  // sees the new value without any read-after-write trickery.
  const selectedWalletId = ref<string | null>(null)

  const disconnecting = ref<boolean>(false)

  // Subscribe in setup() on the client only. SSR-safe because the guard
  // skips the side-effecting `manager.subscribe` on the server.
  let unsubscribe: (() => void) | null = null
  if (typeof window !== 'undefined') {
    unsubscribe = manager.subscribe(() => {
      state.value = manager.getState()
      context.value = manager.getContext()
      sortedWalletsRef.value = manager.getSortedWallets()
      platformRef.value = manager.getPlatform()
    })
  }

  onMounted(() => {
    // `manager.initialize()` reads sessionStorage + URL; client-only.
    // The FlowMachine's `notify()` fires our subscribe callback
    // synchronously, so any state advancement triggered by initialize is
    // already reflected in the refs by the time this call returns — no
    // manual re-pull needed.
    manager.initialize()
  })

  onUnmounted(() => {
    unsubscribe?.()
  })

  // ---- Derived (computed) ----------------------------------------------

  const sortedWallets = computed<WalletListEntry[]>(() => sortedWalletsRef.value)
  const platform = computed<PlatformInfo>(() => platformRef.value)

  const publicKey = computed<string | null>(() => context.value.publicKey)
  const signature = computed<string | null>(() => context.value.signature)
  const error = computed<WalletError | null>(() => context.value.error)

  const isConnecting = computed(() => state.value === 'connecting')
  const isSigning = computed(() => state.value === 'signing')
  const isAuthenticated = computed(() => state.value === 'authenticated')
  const isConnected = computed(
    () =>
      state.value === 'connected' || state.value === 'signing' || state.value === 'authenticated',
  )

  const wallet = computed<WalletListEntry | null>(() => {
    const id = context.value.walletId ?? selectedWalletId.value
    if (!id) return null
    return sortedWallets.value.find((w) => w.id === id) ?? null
  })

  // ---- Methods ---------------------------------------------------------

  const select = (walletId: string): void => {
    selectedWalletId.value = walletId
  }

  const connect = async (walletId?: string): Promise<void> => {
    const id = walletId ?? selectedWalletId.value ?? manager.getContext().walletId
    if (!id) {
      throw new WalletConnectionError(
        'No wallet selected. Pass a walletId to connect() or call select(walletId) first.',
      )
    }
    await manager.connect(id)
  }

  const disconnect = async (): Promise<void> => {
    disconnecting.value = true
    try {
      await manager.disconnect()
      selectedWalletId.value = null
    } finally {
      disconnecting.value = false
    }
  }

  const signMessage = (message: Uint8Array): Promise<Uint8Array> => manager.signMessage(message)
  const signIn = (input?: SolanaSignInInput): Promise<SolanaSignInOutput> => manager.signIn(input)
  const signTransaction = (
    transaction: Uint8Array,
    chain?: IdentifierString,
  ): Promise<Uint8Array> => manager.signTransaction(transaction, chain)
  const signAndSendTransaction = (
    transaction: Uint8Array,
    options?: { chain?: IdentifierString } & SolanaSignAndSendTransactionOptions,
  ): Promise<{ signature: Uint8Array }> => manager.signAndSendTransaction(transaction, options)

  return {
    state,
    publicKey,
    signature,
    wallet,
    sortedWallets,
    platform,
    error,
    connecting: isConnecting,
    connected: isConnected,
    disconnecting,
    isConnecting,
    isConnected,
    isSigning,
    isAuthenticated,
    select,
    connect,
    disconnect,
    signMessage,
    signIn,
    signTransaction,
    signAndSendTransaction,
  }
}
