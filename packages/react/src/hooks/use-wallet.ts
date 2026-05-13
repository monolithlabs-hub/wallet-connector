import {
  createWalletManager,
  WalletConnectionError,
  type FlowState,
  type SolanaSignInInput,
  type SolanaSignInOutput,
  type WalletConfig,
  type WalletError,
  type WalletManager,
  type WalletManagerConfig,
} from '@monolithlabs/wallet-connect-core'
import { useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { WalletConnectContext } from '../context/wallet-connect-context'

/**
 * Return shape of {@link useWallet}.
 *
 * The first half of the fields mirror `@solana/wallet-adapter-react`'s
 * `WalletContextState` so a consumer migrating from that package only has
 * to change their import path. `wallet` here is this library's
 * {@link WalletConfig} (display metadata) — not wallet-adapter's `Wallet`
 * (adapter wrapper); the field name matches but the shape differs slightly.
 *
 * The second half (`state`, `sortedWallets`, `is*`, `error`) are this
 * library's additions — richer state machine view + a display-ready wallet
 * list — built on top of the same {@link WalletManager}.
 */
export interface UseWalletReturn {
  // --- wallet-adapter-react compat ---------------------------------------
  wallet: WalletConfig | null
  publicKey: string | null
  connecting: boolean
  connected: boolean
  disconnecting: boolean
  select: (walletId: string) => void
  /**
   * Initiate a connect flow. Pass the `walletId` directly, or call
   * {@link UseWalletReturn.select} first and `connect()` will use the
   * selection. The optional argument is the safer path: it bypasses the
   * React state cycle entirely (no stale-closure risk) and is what
   * `<ConnectButton>` uses internally.
   */
  connect: (walletId?: string) => Promise<void>
  disconnect: () => Promise<void>
  signMessage: (message: Uint8Array) => Promise<Uint8Array>
  signIn: (input?: SolanaSignInInput) => Promise<SolanaSignInOutput>

  // --- project-specific additions ----------------------------------------
  state: FlowState
  sortedWallets: WalletConfig[]
  isConnecting: boolean
  isConnected: boolean
  isSigning: boolean
  isAuthenticated: boolean
  error: WalletError | null
  /**
   * The SIWS signature returned by the wallet, base58-encoded. Set on the
   * `signing → authenticated` transition; cleared on `RESET`. `null` until
   * `requireSignIn: true` flows complete.
   */
  signature: string | null
}

/**
 * React hook over a {@link WalletManager}.
 *
 * - If `config` is provided, the hook owns a manager scoped to the
 *   component and destroys it on unmount.
 * - Otherwise it reads the manager from {@link WalletConnectContext}
 *   (supplied by `<WalletConnectProvider>` in TASK-202). Throws a
 *   descriptive error if neither is available.
 *
 * Subscribes to the manager via `useSyncExternalStore`, which handles
 * concurrent rendering and StrictMode double-invoke automatically.
 *
 * **`config` is locked at first mount.** The owned manager is created
 * once via `useState`'s lazy initializer so its side effects (subscribing
 * to the Wallet-Standard registry, etc.) run exactly once. Subsequent
 * changes to the `config` argument are ignored — to swap configuration,
 * unmount the consumer or use `<WalletConnectProvider>` (TASK-202), which
 * owns the manager at a stable position in the tree.
 *
 * Server-side rendering: the snapshot returned during SSR is always
 * `'idle'`. If the client manager hydrates with a resumed flow state
 * (e.g., a deep-link callback), the first client render will produce
 * different output than the server — acceptable for a client-only wallet
 * library, but worth knowing if you embed `useWallet` in a server-rendered
 * tree.
 */
export function useWallet(config?: WalletManagerConfig): UseWalletReturn {
  const contextManager = useContext(WalletConnectContext)

  // Lazy-init so the side-effecting factory (which subscribes to the
  // global Wallet-Standard registry) runs exactly once per mount. React
  // is allowed to drop a useMemo cache; useState's initializer is not.
  const [ownedManager] = useState<WalletManager | null>(() =>
    config ? createWalletManager(config) : null,
  )

  useEffect(() => {
    return () => {
      if (ownedManager) ownedManager.destroy()
    }
  }, [ownedManager])

  const manager = contextManager ?? ownedManager
  if (!manager) {
    throw new Error(
      'useWallet() must be used inside a <WalletConnectProvider> or called with a config argument',
    )
  }

  // Run initialize() once per manager identity. The implementation is
  // idempotent (reads pending state, no-ops if none) — so StrictMode's
  // double-invoke during dev is harmless.
  useEffect(() => {
    manager.initialize()
  }, [manager])

  const subscribe = useCallback(
    (onStoreChange: () => void) => manager.subscribe(onStoreChange),
    [manager],
  )
  const getSnapshot = useCallback(() => manager.getState(), [manager])
  // SSR fallback: pre-hydration the manager has no state to report; report
  // 'idle' so server-rendered output is deterministic.
  const state = useSyncExternalStore<FlowState>(subscribe, getSnapshot, () => 'idle')

  // Read context on every render. It changes in lockstep with state
  // transitions (every context mutation is followed by `notify()` in the
  // FlowMachine), so re-rendering on state change is sufficient to keep
  // publicKey / error / signature in sync.
  const context = manager.getContext()

  // wallet-adapter compat: track the user-selected wallet (pre-connect)
  // separately from the in-flight / connected one. Once a connect resolves
  // the manager's context.walletId takes over as the source of truth.
  //
  // Stored in BOTH state (so `wallet` re-renders when selection changes)
  // AND a ref (so `connect()` can read the latest selection synchronously
  // — `connect()` in the same handler as `select()` would otherwise close
  // over the pre-`select` state value and throw "No wallet selected").
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null)
  const selectedWalletIdRef = useRef<string | null>(null)

  // Local flag for the disconnecting transition — the FlowMachine collapses
  // disconnect into a sync RESET so there's no observable "disconnecting"
  // state otherwise. Tracks the in-flight promise from `disconnect()`.
  const [disconnecting, setDisconnecting] = useState(false)

  // Sorted wallets are re-derived on every render. The list is small
  // (typically ≤ 5) and the computation is cheap; memoizing here would
  // require tracking the platform info too, which is private to the
  // manager.
  const sortedWallets = manager.getSortedWallets()

  // Compute inline: `sortedWallets` is a fresh array each render so a
  // `useMemo` here would never hit. The `.find` over a handful of
  // wallets is cheap.
  const activeWalletId = context.walletId ?? selectedWalletId
  const wallet: WalletConfig | null =
    activeWalletId !== null ? (sortedWallets.find((w) => w.id === activeWalletId) ?? null) : null

  const select = useCallback((walletId: string) => {
    // Write the ref FIRST, synchronously — so `connect()` called in the
    // same event handler sees the latest selection without waiting for
    // the setState to flush.
    selectedWalletIdRef.current = walletId
    setSelectedWalletId(walletId)
  }, [])

  const connect = useCallback(
    async (walletId?: string) => {
      // Resolution order: explicit arg → ref-tracked selection → the
      // manager's in-flight walletId (lets reconnects on a known wallet
      // work without re-calling select). The closure only depends on
      // `manager`, so this callback is stable across renders.
      const id = walletId ?? selectedWalletIdRef.current ?? manager.getContext().walletId
      if (!id) {
        throw new WalletConnectionError(
          'No wallet selected. Pass a walletId to connect() or call select(walletId) first.',
        )
      }
      await manager.connect(id)
    },
    [manager],
  )

  const disconnect = useCallback(async () => {
    setDisconnecting(true)
    try {
      await manager.disconnect()
      selectedWalletIdRef.current = null
      setSelectedWalletId(null)
    } finally {
      setDisconnecting(false)
    }
  }, [manager])

  const signMessage = useCallback((message: Uint8Array) => manager.signMessage(message), [manager])
  const signIn = useCallback((input?: SolanaSignInInput) => manager.signIn(input), [manager])

  const connected = state === 'connected' || state === 'signing' || state === 'authenticated'

  return {
    wallet,
    publicKey: context.publicKey,
    connecting: state === 'connecting',
    connected,
    disconnecting,
    select,
    connect,
    disconnect,
    signMessage,
    signIn,
    state,
    sortedWallets,
    isConnecting: state === 'connecting',
    isConnected: connected,
    isSigning: state === 'signing',
    isAuthenticated: state === 'authenticated',
    error: context.error,
    signature: context.signature,
  }
}
