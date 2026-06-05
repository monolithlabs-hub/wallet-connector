import type {
  SolanaSignAndSendTransactionOptions,
  SolanaSignInInput,
  SolanaSignInOutput,
} from '@solana/wallet-standard-features'
import type { IdentifierString } from '@wallet-standard/base'
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
import { asWalletName } from './wallet-name'
import {
  mergeWalletList,
  normalizeWalletName,
  walletNameSlug,
  type WalletListEntry,
} from './wallets/list-entry'
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
   * Idempotent and lenient when destroyed — silently no-ops after
   * {@link destroy}. Safe to call from React effects under StrictMode.
   */
  initialize(): void
  /**
   * Display-ready wallet list per the platform + pinnedWallet rules.
   *
   * Each entry carries the consumer's {@link WalletConfig} metadata plus
   * runtime fields derived from the Wallet Standard registry: `isDetected`
   * (drives the "Detected" badge), `source` (`'configured'` vs.
   * `'discovered'`), and a fallback `icon` data URI from the registered
   * wallet when the consumer didn't supply one.
   *
   * Wallets installed via Wallet Standard but NOT in
   * {@link WalletManagerConfig.wallets} appear as `source: 'discovered'`
   * entries at the end of the list — call `connect(entry.id)` on them
   * exactly like configured wallets; the manager resolves the adapter
   * from the registry.
   */
  getSortedWallets(): WalletListEntry[]
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
  /**
   * Sign a serialized transaction with the currently-connected wallet. Same
   * platform constraints as {@link signMessage} — extension path only; throws
   * `WalletNotReadyError` on the mobile deep-link path. The chain defaults to
   * the configured {@link WalletManagerConfig.cluster}; pass `chain` to
   * override. Returns the signed, serialized transaction bytes.
   */
  signTransaction(transaction: Uint8Array, chain?: IdentifierString): Promise<Uint8Array>
  /**
   * Sign and broadcast a serialized transaction with the currently-connected
   * wallet. Same platform constraints as {@link signMessage}. The chain
   * defaults to the configured {@link WalletManagerConfig.cluster}. Returns
   * the transaction signature as raw bytes.
   */
  signAndSendTransaction(
    transaction: Uint8Array,
    options?: { chain?: IdentifierString } & SolanaSignAndSendTransactionOptions,
  ): Promise<{ signature: Uint8Array }>
  getState(): FlowState
  getContext(): FlowContext
  /**
   * Platform snapshot, augmented with Wallet Standard registry state. The
   * `hasOpindexExtension` flag is `true` if EITHER the legacy
   * `window.opindex` sentinel is set OR the configured `pinnedWallet`
   * is registered via Wallet Standard. Re-read on every notification —
   * the manager re-emits when the registry changes.
   */
  getPlatform(): PlatformInfo
  /**
   * Monotonic counter that increments on every event the manager fans out
   * to subscribers (FlowMachine state change OR Wallet Standard registry
   * change). Use as the snapshot value for React's
   * `useSyncExternalStore` so registry-only updates trigger a re-render
   * even when the FlowState string is unchanged.
   */
  getVersion(): number
  subscribe(listener: StateListener): Unsubscribe
  /** Detach from the wallet-standard registry and tear down adapters. Idempotent. */
  destroy(): void
  /**
   * Returns `true` once {@link destroy} has been called. Once `true`,
   * always `true` — destruction is terminal for mutating methods.
   *
   * Useful for consumers operating around React StrictMode's double-mount,
   * where an effect cleanup may have destroyed the manager that subsequent
   * code still holds a reference to. The framework wrappers
   * (`<WalletConnectProvider>`, `useWallet`) use this to detect a stale
   * manager and rebuild.
   *
   * Observer methods (`subscribe`, `initialize`, `getState`, `getContext`,
   * `getPlatform`, `getVersion`, `getSortedWallets`) degrade gracefully
   * after destroy. Mutating methods (`connect`, `disconnect`, `signMessage`,
   * `signIn`) still throw.
   */
  isDestroyed(): boolean
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

  // Manager-level subscribers fan-out. FlowMachine state changes AND
  // Wallet Standard registry changes are both routed through this set so
  // consumers (React's `useSyncExternalStore`, Vue's `watch`) re-render on
  // either signal. Listener exceptions are isolated via the
  // `queueMicrotask` rethrow pattern used by the FlowMachine (TASK-104)
  // and discovery (TASK-107).
  const listeners = new Set<StateListener>()
  let version = 0
  function notify(): void {
    version += 1
    const state = machine.getState()
    for (const listener of [...listeners]) {
      try {
        listener(state)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  // Bridge machine state → consumer's onStateChange callback AND the
  // manager fan-out. Capture the unsubscribe so `destroy()` can detach
  // cleanly.
  const unsubscribeStateChange = machine.subscribe((state) => {
    config.onStateChange?.(state)
    notify()
  })

  // Lazy adapter holders — populated based on the platform strategy.
  let discoveryHandle: DiscoveryHandle | null = null
  let deepLinkAdapter: DeepLinkAdapter | null = null
  let unsubscribeDiscovery: (() => void) | null = null

  if (platform.strategy === 'extension') {
    discoveryHandle = discoverStandardWallets()
    // Registry changes invalidate the augmented platform cache and
    // re-notify subscribers so the sorted list + install badge reflect a
    // late-registering Opindex.
    unsubscribeDiscovery = discoveryHandle.subscribe(() => {
      augmentedPlatformCache = null
      notify()
    })
  } else if (platform.strategy === 'deeplink') {
    deepLinkAdapter = createDeepLinkAdapterForConfig(config, platform, cluster)
  }

  // On the mobile deep-link path, recover when the user returns to the page —
  // either to finish a real callback or to un-freeze an abandoned connect.
  let removeReturnListeners: (() => void) | null = null
  if (deepLinkAdapter && typeof document !== 'undefined' && typeof window !== 'undefined') {
    const onVisible = (): void => {
      if (!document.hidden) recoverOrResume()
    }
    const onPageShow = (): void => recoverOrResume()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onPageShow)
    removeReturnListeners = (): void => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onPageShow)
    }
  }

  // Cache of the augmented platform. Invalidated on every registry
  // change; recomputed lazily when {@link getPlatform} or
  // {@link getSortedWallets} is called.
  let augmentedPlatformCache: PlatformInfo | null = null
  function getAugmentedPlatform(): PlatformInfo {
    if (augmentedPlatformCache) return augmentedPlatformCache
    let hasOpindexExtension = platform.hasOpindexExtension
    if (!hasOpindexExtension && pinnedWallet && discoveryHandle) {
      const adapters = discoveryHandle.getAdapters()
      const pinnedConfig = config.wallets.find((w) => w.id === pinnedWallet)
      const matched = pinnedConfig
        ? // Configured pin target: match by standardName / case-insensitive name.
          adapters.some((a) => walletConfigMatchesName(pinnedConfig, a.wallet.name))
        : // Discovered-only pin target (not in `config.wallets`): the merged
          // entry's id is the wallet's name slug, so a registered wallet whose
          // slug === pinnedWallet IS the pin target. Lets a Wallet-Standard-only
          // Opindex (no `window.*` global) pin to index 0 on desktop.
          adapters.some((a) => walletNameSlug(a.wallet.name) === pinnedWallet)
      if (matched) hasOpindexExtension = true
    }
    augmentedPlatformCache = { ...platform, hasOpindexExtension }
    return augmentedPlatformCache
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
    // Normalized name match (tolerates the "X" vs "X Wallet" variance) so
    // `connect()` resolves the same adapter the merged list deduped against.
    const target = normalizeWalletName(walletConfig.name)
    return adapters.find((a) => normalizeWalletName(a.wallet.name) === target) ?? null
  }

  function findWalletConfig(walletId: string): WalletConfig | null {
    return config.wallets.find((w) => w.id === walletId) ?? null
  }

  /**
   * Synthesize a minimal {@link WalletConfig} for a wallet that lives only
   * in the Wallet Standard registry (no matching entry in
   * `config.wallets`). The slug is the lowercased / dash-normalized
   * wallet name from {@link walletNameSlug}, so consumers calling
   * `connect(entry.id)` on a `source: 'discovered'` {@link WalletListEntry}
   * land here.
   *
   * Returns null when discovery isn't running (mobile / install-prompt
   * strategies) or when no adapter slugs to the requested id. The deep-link
   * fields are empty strings — never read on the `extension` strategy
   * (the only strategy where discovery runs).
   */
  function buildDiscoveredWalletConfig(walletId: string): WalletConfig | null {
    if (!discoveryHandle) return null
    const adapter = discoveryHandle
      .getAdapters()
      .find((a) => walletNameSlug(a.wallet.name) === walletId)
    if (!adapter) return null
    return {
      id: walletId,
      name: adapter.wallet.name,
      priority: Number.MAX_SAFE_INTEGER,
      icon: adapter.wallet.icon ?? '',
      deepLinkScheme: '',
      universalLink: '',
      appStoreUrl: '',
      playStoreUrl: '',
      standardName: asWalletName(adapter.wallet.name),
    }
  }

  /** `findWalletConfig` with discovered-only fallback. */
  function resolveWalletConfig(walletId: string): WalletConfig | null {
    return findWalletConfig(walletId) ?? buildDiscoveredWalletConfig(walletId)
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
    const walletConfig = resolveWalletConfig(walletId)
    if (!walletConfig) {
      throw reportError(
        new WalletConnectionError(
          `Wallet '${walletId}' is not registered in the manager config and not detected via Wallet Standard`,
        ),
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

    // strategy === 'install-prompt' (desktop, no extension). Prefer the
    // browser-extension install page (e.g. Chrome Web Store), falling back to
    // the generic install/landing page. Open it in a new tab so the dapp stays
    // put, then return the flow to idle (no error banner). Otherwise surface
    // the informational "not ready" error.
    const desktopInstallUrl = walletConfig.extensionUrl ?? walletConfig.installUrl
    if (desktopInstallUrl && typeof window !== 'undefined') {
      window.open(desktopInstallUrl, '_blank', 'noopener,noreferrer')
      machine.send({ type: 'RESET' })
      return
    }
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

    // Install/open-only wallet (no `universalLink`, e.g. Opindex): there is no
    // external mobile connect protocol. Send the user to the download/landing
    // page and return the flow to idle — no handshake, no pending state, no
    // never-resolving promise that could wedge the modal.
    if (!walletConfig.universalLink) {
      deepLinkAdapter.openInstall(walletConfig)
      machine.send({ type: 'RESET' })
      return
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

  /**
   * Drive the FlowMachine + lifecycle callbacks from a parsed deep-link
   * callback. Works from BOTH entry points:
   * - fresh page load (`initialize`): machine is `'idle'`, so we open with
   *   `CONNECT_INITIATED`;
   * - same-context return (bfcache restore via `recoverOrResume`): the machine
   *   is already `'connecting'` from the tap that started the flow, so we skip
   *   straight to `WALLET_CONNECTED`. Any other lingering state is RESET first.
   */
  function applyResumedCallback(
    pending: { walletId: string; requireSignIn: boolean },
    result: { publicKey: string; signature?: string },
  ): void {
    if (machine.getState() !== 'connecting') {
      if (machine.getState() !== 'idle') machine.send({ type: 'RESET' })
      machine.send({ type: 'CONNECT_INITIATED', walletId: pending.walletId })
    }
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

  /** Returns true iff a pending callback was found, parsed, and applied. */
  function tryResumeFromCallback(): boolean {
    if (destroyed || !deepLinkAdapter) return false
    // Read pending state BEFORE calling resumeFromCallback (which clears it).
    const pending = getPendingState()
    if (!pending) return false
    const result = deepLinkAdapter.resumeFromCallback()
    if (!result) return false
    applyResumedCallback(pending, result)
    return true
  }

  function initialize(): void {
    // Lenient when destroyed — `initialize` is an observer-style entry point
    // called from React effects under StrictMode, where the manager may have
    // been destroyed by a previous cleanup pass. A dead manager has nothing
    // to resume; silently no-op rather than throwing.
    if (tryResumeFromCallback()) {
      inflightConnect = null
      inflightWalletId = null
    }
  }

  /**
   * Run on every return to the page (`visibilitychange` → visible /
   * `pageshow`). Either completes a genuine wallet callback, or — when the
   * user came back WITHOUT finishing a deep-link connect — un-freezes the UI.
   *
   * Without this, an abandoned deep-link leaves the adapter `isConnecting`,
   * the manager's `inflightConnect` slot occupied, and the FlowMachine stuck
   * in `'connecting'`, so every wallet button stays disabled (issue 2).
   */
  function recoverOrResume(): void {
    if (destroyed || !deepLinkAdapter) return
    if (tryResumeFromCallback()) {
      // Completed: drop the dangling inflight slot (the adapter's connect
      // promise never resolved, so the manager's `finally` never ran).
      inflightConnect = null
      inflightWalletId = null
      return
    }
    const state = machine.getState()
    if (state === 'connecting' || state === 'signing') {
      deepLinkAdapter.cancelPendingConnect()
      inflightConnect = null
      inflightWalletId = null
      // RESET notifies subscribers via the machine subscription (re-enables
      // the modal buttons). Pending state is preserved by cancelPendingConnect
      // so a late callback can still resume on a real navigation.
      machine.send({ type: 'RESET' })
    }
  }

  function requireConnectedStandardAdapter(): StandardWalletAdapter {
    if (platform.strategy !== 'extension') {
      throw new WalletNotReadyError(
        'Standalone signMessage / signIn / signTransaction / signAndSendTransaction is not available on the mobile deep-link path; use `requireSignIn: true` on connect() instead',
      )
    }
    const ctx = machine.getContext()
    if (!ctx.walletId) {
      throw new WalletNotConnectedError('No wallet is connected')
    }
    const walletConfig = resolveWalletConfig(ctx.walletId)
    if (!walletConfig) {
      throw new WalletNotConnectedError(
        `Connected wallet '${ctx.walletId}' is no longer registered`,
      )
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

  // Map the configured cluster to a Wallet-Standard chain id. Only
  // 'devnet' and 'mainnet-beta' exist; anything that isn't devnet maps to
  // mainnet — the wallet validates the actual endpoint it talks to regardless.
  function configChain(): IdentifierString {
    return (cluster === 'devnet' ? 'solana:devnet' : 'solana:mainnet') as IdentifierString
  }

  async function signTransaction(
    transaction: Uint8Array,
    chain?: IdentifierString,
  ): Promise<Uint8Array> {
    assertAlive()
    const adapter = requireConnectedStandardAdapter()
    return adapter.signTransaction(transaction, chain ?? configChain())
  }

  async function signAndSendTransaction(
    transaction: Uint8Array,
    options?: { chain?: IdentifierString } & SolanaSignAndSendTransactionOptions,
  ): Promise<{ signature: Uint8Array }> {
    assertAlive()
    const adapter = requireConnectedStandardAdapter()
    const { chain, ...sendOptions } = options ?? {}
    return adapter.signAndSendTransaction(transaction, chain ?? configChain(), sendOptions)
  }

  async function disconnect(): Promise<void> {
    assertAlive()
    if (platform.strategy === 'extension') {
      const ctx = machine.getContext()
      if (ctx.walletId) {
        const walletConfig = resolveWalletConfig(ctx.walletId)
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
    getSortedWallets: () => {
      const augmented = getAugmentedPlatform()
      let entries = mergeWalletList(config.wallets, discoveryHandle?.getAdapters() ?? [])
      // `mergeWalletList` only sees the Wallet Standard registry. The
      // augmented platform also considers the legacy `window.opindex`
      // sentinel — when that says the pinned wallet is installed but the
      // registry doesn't have it (rare in production; real Opindex
      // registers via Wallet Standard), reflect that as `isDetected: true`
      // on the pinned entry so the badge renders "Detected" instead of
      // "Install". Pure helper; doesn't mutate `entries`.
      if (pinnedWallet && augmented.hasOpindexExtension) {
        entries = entries.map((e) =>
          e.id === pinnedWallet && !e.isDetected ? { ...e, isDetected: true } : e,
        )
      }
      return getSortedWallets(entries, augmented, { pinnedWalletId: pinnedWallet })
    },
    connect,
    disconnect,
    signMessage,
    signIn,
    signTransaction,
    signAndSendTransaction,
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    getPlatform: () => getAugmentedPlatform(),
    getVersion: () => version,
    subscribe: (listener) => {
      // Lenient when destroyed — `subscribe` is called by
      // `useSyncExternalStore` under React StrictMode, where the manager
      // may have been destroyed by a previous cleanup pass. `destroy()`
      // clears `listeners` so a no-op unsubscribe is safe.
      if (destroyed) return () => {}
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isDestroyed: () => destroyed,
    destroy: () => {
      if (destroyed) return
      destroyed = true
      unsubscribeStateChange()
      if (unsubscribeDiscovery) unsubscribeDiscovery()
      if (removeReturnListeners) removeReturnListeners()
      listeners.clear()
      if (discoveryHandle) discoveryHandle.destroy()
      if (deepLinkAdapter) deepLinkAdapter.destroy()
    },
  }
}

/**
 * True if a registered Wallet Standard wallet name matches the given
 * {@link WalletConfig}. Prefers `standardName` (exact match); falls back
 * to case-insensitive `name`. Pure / safe to call with any string.
 */
function walletConfigMatchesName(walletConfig: WalletConfig, name: string): boolean {
  if (walletConfig.standardName && walletConfig.standardName === name) return true
  return normalizeWalletName(walletConfig.name) === normalizeWalletName(name)
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
