import type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features'
import bs58 from 'bs58'

import { createDeepLinkAdapter, type DeepLinkAdapter } from './adapters/deep-link-adapter'
import type { SolanaCluster } from './adapters/deep-link-builder'
import type { StandardWalletAdapter } from './adapters/standard-wallet-adapter'
import { discoverStandardWallets, type DiscoveryHandle } from './discovery'
import {
  WalletConnectionError,
  WalletError,
  WalletNotConnectedError,
  WalletNotReadyError,
} from './errors'
import { detectPlatform, type PlatformInfo } from './platform/detector'
import { getPendingState, saveLastUsedWallet } from './session/store'
import {
  createFlowMachine,
  type FlowContext,
  type FlowState,
  type StateListener,
  type Unsubscribe,
} from './state/machine'
import { getSortedWallets, type WalletConfig } from './wallets/sorter'

/**
 * Configuration for {@link createWalletManager}. Most fields are optional;
 * the only required input is the list of wallets the dapp wants to support.
 */
export interface WalletManagerConfig {
  /** Display metadata for each wallet shown in the connect UI. */
  wallets: WalletConfig[]
  /**
   * If `true`, after the wallet returns a public key the manager runs an
   * SIWS sign step using {@link signInMessage}. The full flow is
   * `idle → connecting → connected → signing → authenticated`. Defaults to
   * `false`.
   */
  requireSignIn?: boolean
  /**
   * Wallet id to pin per the platform-aware rules in
   * {@link getSortedWallets}. Default `'opindex'`. Set `null` to disable
   * pinning entirely (neutral mode for library consumers).
   */
  pinnedWallet?: string | null
  /**
   * Builds the SIWS message text from the user's public key.
   *
   * On desktop / in-app browser, called *after* connect with the real
   * public key. On mobile (deep-link), called *before* connect with an
   * empty string — the wallet substitutes its own address into the SIWS
   * message. Consumers must handle the empty-arg case (typically by
   * omitting the address line from the message).
   */
  signInMessage?: (publicKey: string) => string
  /** Solana cluster sent to the wallet. Default `'mainnet-beta'`. */
  cluster?: SolanaCluster
  /**
   * Absolute http(s) URL of the dapp; shown by mobile wallets in their
   * connect prompt. Defaults to `window.location.origin`.
   */
  appUrl?: string
  /**
   * Path on the dapp the mobile wallet redirects back to after connect.
   * Defaults to `window.location.pathname` (current page).
   */
  callbackPath?: string
  /**
   * Fires on every {@link FlowState} transition. **Fires before** the
   * lifecycle callbacks below within a single `connect()` flow — the
   * FlowMachine's auto-step transitions all run inside `machine.send`,
   * so by the time `onConnected` / `onAuthenticated` fire the state has
   * already advanced. If you need the publicKey at the transition tick,
   * read it from `manager.getContext()` inside this handler.
   */
  onStateChange?: (state: FlowState) => void
  /**
   * Fires once when the wallet returns a public key, regardless of
   * `requireSignIn`. For SIWS flows, this fires before {@link onAuthenticated}
   * but AFTER any FlowMachine state notifications for the same operation.
   */
  onConnected?: (publicKey: string) => void
  /**
   * Fires once when SIWS sign-in completes successfully. Only fires when
   * `requireSignIn: true`; the signature is base58-encoded.
   */
  onAuthenticated?: (publicKey: string, signature: string) => void
  /** Fires on any connect-flow error. */
  onError?: (error: WalletError) => void
}

export interface WalletManager {
  /**
   * Call on page load. On mobile, detects and resumes a pending deep-link
   * flow if the URL contains callback parameters. No-op on desktop and on
   * a normal (non-callback) page load.
   *
   * Throws after {@link destroy}.
   */
  initialize(): void
  /** Display-ready wallet list per the platform + pinnedWallet rules. */
  getSortedWallets(): WalletConfig[]
  /**
   * Initiate connect for a wallet from the config list. Auto-resets the
   * FlowMachine when called from any non-idle state, so retries after a
   * failed flow or re-auth with a different wallet just work. Concurrent
   * calls share one in-flight promise (single-flight). Throws after
   * {@link destroy}.
   */
  connect(walletId: string): Promise<void>
  /** Clear local session state. Emits `'disconnect'` to subscribers if previously connected. Throws after {@link destroy}. */
  disconnect(): Promise<void>
  /**
   * Sign an arbitrary message with the currently-connected wallet. Only
   * supported on the extension / in-app-browser path (desktop and the
   * Phantom-style in-app browsers). On mobile (deep-link) this throws
   * `WalletNotReadyError` — the mobile path uses bundled SIWS via
   * `requireSignIn: true` on `connect()`, not standalone post-connect signs.
   *
   * Throws `WalletNotConnectedError` if no wallet is connected, and after
   * {@link destroy}.
   */
  signMessage(message: Uint8Array): Promise<Uint8Array>
  /**
   * Sign-In With Solana with the currently-connected wallet. Same
   * platform constraints as {@link signMessage}. Throws `WalletNotReadyError`
   * if the wallet doesn't implement the `solana:signIn` feature.
   */
  signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput>
  getState(): FlowState
  getContext(): FlowContext
  subscribe(listener: StateListener): Unsubscribe
  /** Detach from the wallet-standard registry and tear down adapters. Idempotent. */
  destroy(): void
}

const DEFAULT_PINNED_WALLET = 'opindex'

/**
 * Build a {@link WalletManager}. This is the canonical public entry point;
 * dapps should create one per app instance and share it (do NOT call this
 * per-component — see {@link "../discovery" | discoverStandardWallets}
 * docs on the singleton expectation).
 *
 * Wires together the platform detector, the flow state machine, the
 * session store, the wallet-standard discovery / adapter (desktop and
 * in-app browser path), and the deep-link adapter (mobile path).
 */
export function createWalletManager(config: WalletManagerConfig): WalletManager {
  const requireSignIn = config.requireSignIn ?? false
  const pinnedWallet =
    config.pinnedWallet === undefined ? DEFAULT_PINNED_WALLET : config.pinnedWallet
  const cluster: SolanaCluster = config.cluster ?? 'mainnet-beta'
  const platform = detectPlatform()

  const machine = createFlowMachine()
  // Bridge machine state → consumer's onStateChange callback. Listener
  // exceptions are already isolated by the FlowMachine's queueMicrotask
  // rethrow (TASK-104 hardening). Capture the unsubscribe so `destroy()`
  // can detach cleanly (tidiness — the FlowMachine is GC'd with the
  // manager so it's not a real leak, but explicit cleanup is good form).
  const unsubscribeStateChange = machine.subscribe((state) => {
    config.onStateChange?.(state)
  })

  // Lazy adapter holders — populated based on the platform strategy.
  let discoveryHandle: DiscoveryHandle | null = null
  let deepLinkAdapter: DeepLinkAdapter | null = null

  if (platform.strategy === 'extension') {
    discoveryHandle = discoverStandardWallets()
  } else if (platform.strategy === 'deeplink') {
    deepLinkAdapter = createDeepLinkAdapterForConfig(config, platform, cluster)
  }

  let destroyed = false
  let inflightConnect: Promise<void> | null = null
  let inflightWalletId: string | null = null

  function assertAlive(): void {
    if (destroyed) throw new Error('WalletManager has been destroyed')
  }

  /**
   * Invoke a consumer callback. Exceptions are surfaced asynchronously via
   * `queueMicrotask` rethrow so a bad consumer handler doesn't poison the
   * rest of the connect flow (matches the FlowMachine listener-isolation
   * pattern from TASK-104).
   */
  function safeCallback<A extends unknown[]>(
    fn: ((...args: A) => void) | undefined,
    ...args: A
  ): void {
    if (!fn) return
    try {
      fn(...args)
    } catch (err) {
      queueMicrotask(() => {
        throw err
      })
    }
  }

  function findStandardAdapter(walletConfig: WalletConfig): StandardWalletAdapter | null {
    if (!discoveryHandle) return null
    const adapters = discoveryHandle.getAdapters()
    // Prefer explicit standardName match; fall back to case-insensitive name.
    const byStandardName = walletConfig.standardName
      ? adapters.find((a) => a.wallet.name === walletConfig.standardName)
      : undefined
    if (byStandardName) return byStandardName
    return (
      adapters.find((a) => a.wallet.name.toLowerCase() === walletConfig.name.toLowerCase()) ?? null
    )
  }

  function findWalletConfig(walletId: string): WalletConfig | null {
    return config.wallets.find((w) => w.id === walletId) ?? null
  }

  function reportError(err: unknown): WalletError {
    const walletError =
      err instanceof WalletError
        ? err
        : new WalletConnectionError(err instanceof Error ? err.message : String(err))
    machine.send({ type: 'ERROR', error: walletError })
    safeCallback(config.onError, walletError)
    return walletError
  }

  async function connect(walletId: string): Promise<void> {
    assertAlive()
    // Single-flight: concurrent callers for the SAME wallet share one
    // in-flight promise. The adapters have their own guards (TASK-107 /
    // TASK-108) but at the FlowMachine level a second CONNECT_INITIATED
    // from 'connecting' would throw "Invalid transition" — return the
    // prior promise instead. A call for a DIFFERENT wallet while one is
    // in-flight rejects loudly: silently discarding the new walletId
    // would be confusing UI behavior (user clicks Phantom, then
    // Solflare, and gets a Phantom connection).
    if (inflightConnect) {
      if (inflightWalletId === walletId) return inflightConnect
      throw new WalletConnectionError(
        `connect('${walletId}') was called while a connect('${inflightWalletId ?? '?'}') is still in flight. Wait for it to settle or call disconnect() first.`,
      )
    }

    // Auto-reset on retry: CONNECT_INITIATED is only valid from 'idle',
    // so a previous flow that ended in 'error', 'authenticated', etc.
    // would crash the second `connect()`. RESET kicks any non-idle state
    // back to 'idle' first (clears context too, per TASK-104).
    if (machine.getState() !== 'idle') {
      machine.send({ type: 'RESET' })
    }

    inflightWalletId = walletId
    inflightConnect = doConnect(walletId)
    try {
      return await inflightConnect
    } finally {
      inflightConnect = null
      inflightWalletId = null
    }
  }

  async function doConnect(walletId: string): Promise<void> {
    const walletConfig = findWalletConfig(walletId)
    if (!walletConfig) {
      throw reportError(
        new WalletConnectionError(`Wallet '${walletId}' is not registered in the manager config`),
      )
    }

    machine.send({ type: 'CONNECT_INITIATED', walletId })

    if (platform.strategy === 'extension') {
      await connectViaStandardAdapter(walletConfig)
      return
    }

    if (platform.strategy === 'deeplink') {
      await connectViaDeepLink(walletConfig)
      return
    }

    // strategy === 'install-prompt'
    throw reportError(
      new WalletNotReadyError(
        `No compatible wallet detected. Install ${walletConfig.name} or pick a different wallet.`,
      ),
    )
  }

  async function connectViaStandardAdapter(walletConfig: WalletConfig): Promise<void> {
    const adapter = findStandardAdapter(walletConfig)
    if (!adapter) {
      throw reportError(
        new WalletNotReadyError(
          `Wallet '${walletConfig.name}' is not registered with the Wallet Standard registry`,
        ),
      )
    }

    let publicKey: string
    try {
      const result = await adapter.connect()
      publicKey = result.publicKey
    } catch (err) {
      throw reportError(err)
    }

    machine.send({ type: 'WALLET_CONNECTED', publicKey, requireSignIn })
    safeCallback(config.onConnected, publicKey)
    saveLastUsedWallet(walletConfig.id)

    if (!requireSignIn) return

    machine.send({ type: 'SIGN_INITIATED' })
    let signatureB58: string
    try {
      const messageText = config.signInMessage?.(publicKey) ?? ''
      const messageBytes = new TextEncoder().encode(messageText)
      const signatureBytes = await adapter.signMessage(new Uint8Array(messageBytes))
      signatureB58 = bs58.encode(signatureBytes)
    } catch (err) {
      throw reportError(err)
    }

    machine.send({ type: 'SIGN_COMPLETED', signature: signatureB58 })
    safeCallback(config.onAuthenticated, publicKey, signatureB58)
  }

  async function connectViaDeepLink(walletConfig: WalletConfig): Promise<void> {
    if (!deepLinkAdapter) {
      throw reportError(new WalletNotReadyError('DeepLinkAdapter is unavailable on this platform'))
    }
    // signInMessage is called with '' on mobile because publicKey is only
    // known on the post-redirect page. Documented in the JSDoc.
    const signInMessageStr =
      requireSignIn && config.signInMessage ? config.signInMessage('') : undefined

    try {
      // Never resolves on this page load; we navigate away.
      await deepLinkAdapter.connect({
        wallet: walletConfig,
        requireSignIn,
        ...(signInMessageStr !== undefined && { signInMessage: signInMessageStr }),
      })
    } catch (err) {
      throw reportError(err)
    }
  }

  function initialize(): void {
    assertAlive()
    if (!deepLinkAdapter) return
    // Read pending state BEFORE calling resumeFromCallback (which clears
    // it). We need the walletId + requireSignIn to drive the FlowMachine.
    const pending = getPendingState()
    if (!pending) return

    const result = deepLinkAdapter.resumeFromCallback()
    if (!result) return

    machine.send({ type: 'CONNECT_INITIATED', walletId: pending.walletId })
    machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: result.publicKey,
      requireSignIn: pending.requireSignIn,
    })
    safeCallback(config.onConnected, result.publicKey)

    if (pending.requireSignIn && result.signature) {
      machine.send({ type: 'SIGN_INITIATED' })
      machine.send({ type: 'SIGN_COMPLETED', signature: result.signature })
      safeCallback(config.onAuthenticated, result.publicKey, result.signature)
    }
  }

  function requireConnectedStandardAdapter(): StandardWalletAdapter {
    if (platform.strategy !== 'extension') {
      throw new WalletNotReadyError(
        'Standalone signMessage / signIn is not available on the mobile deep-link path; use `requireSignIn: true` on connect() instead',
      )
    }
    const ctx = machine.getContext()
    if (!ctx.walletId) {
      throw new WalletNotConnectedError('No wallet is connected')
    }
    const walletConfig = findWalletConfig(ctx.walletId)
    if (!walletConfig) {
      throw new WalletNotConnectedError(`Connected wallet '${ctx.walletId}' is not in the config`)
    }
    const adapter = findStandardAdapter(walletConfig)
    if (!adapter) {
      throw new WalletNotReadyError(
        `Wallet '${walletConfig.name}' is no longer registered with the Wallet Standard registry`,
      )
    }
    return adapter
  }

  async function signMessage(message: Uint8Array): Promise<Uint8Array> {
    assertAlive()
    const adapter = requireConnectedStandardAdapter()
    return adapter.signMessage(message)
  }

  async function signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput> {
    assertAlive()
    const adapter = requireConnectedStandardAdapter()
    return adapter.signIn(input)
  }

  async function disconnect(): Promise<void> {
    assertAlive()
    if (platform.strategy === 'extension') {
      const ctx = machine.getContext()
      if (ctx.walletId) {
        const walletConfig = findWalletConfig(ctx.walletId)
        if (walletConfig) {
          const adapter = findStandardAdapter(walletConfig)
          if (adapter) {
            try {
              await adapter.disconnect()
            } catch {
              // Disconnect is best-effort; the FlowMachine reset below
              // is the user-visible outcome.
            }
          }
        }
      }
    } else if (deepLinkAdapter) {
      await deepLinkAdapter.disconnect()
    }
    // Gate the RESET so a disconnect on an already-idle manager doesn't
    // emit a spurious `onStateChange('idle')` to subscribers.
    if (machine.getState() !== 'idle') {
      machine.send({ type: 'RESET' })
    }
  }

  return {
    initialize,
    getSortedWallets: () =>
      getSortedWallets(config.wallets, platform, { pinnedWalletId: pinnedWallet }),
    connect,
    disconnect,
    signMessage,
    signIn,
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    subscribe: (listener) => {
      assertAlive()
      return machine.subscribe(listener)
    },
    destroy: () => {
      if (destroyed) return
      destroyed = true
      unsubscribeStateChange()
      if (discoveryHandle) discoveryHandle.destroy()
      if (deepLinkAdapter) deepLinkAdapter.destroy()
    },
  }
}

function createDeepLinkAdapterForConfig(
  config: WalletManagerConfig,
  _platform: PlatformInfo,
  cluster: SolanaCluster,
): DeepLinkAdapter | null {
  if (typeof window === 'undefined') return null
  const origin = window.location.origin
  const pathname = window.location.pathname
  const appUrl = config.appUrl ?? origin
  const callbackPath = config.callbackPath ?? pathname
  // Treat callbackPath as relative to the origin so consumers can pass
  // either an absolute URL or a path.
  const redirectUrl = /^https?:\/\//.test(callbackPath) ? callbackPath : `${origin}${callbackPath}`
  return createDeepLinkAdapter({ appUrl, redirectUrl, cluster })
}
