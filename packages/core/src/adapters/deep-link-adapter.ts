import bs58 from 'bs58'

import { WalletConnectionError, WalletNotReadyError } from '../errors'
import { detectPlatform } from '../platform/detector'
import {
  clearPendingState,
  createPendingState,
  getPendingState,
  saveLastUsedWallet,
  savePendingState,
} from '../session/store'
import type { WalletConfig } from '../wallets/sorter'

import { type CallbackResult, isCallbackUrl, parseCallback } from './callback-handler'
import {
  type EphemeralKeypair,
  type SolanaCluster,
  buildConnectUrl,
  buildSignAndConnectUrl,
  generateEphemeralKeypair,
} from './deep-link-builder'

/** Lifecycle events emitted by a {@link DeepLinkAdapter} subscriber. */
export type DeepLinkAdapterEvent = 'connect' | 'disconnect'
export type DeepLinkAdapterListener = (event: DeepLinkAdapterEvent) => void
export type DeepLinkAdapterUnsubscribe = () => void

/** Input to {@link DeepLinkAdapter.connect}. */
export interface DeepLinkConnectInput {
  wallet: WalletConfig
  requireSignIn?: boolean
  /** SIWS message text, required when `requireSignIn` is true. */
  signInMessage?: string
}

/** Configuration set once per adapter instance. */
export interface DeepLinkAdapterOptions {
  /** Absolute http(s) URL of the dapp; shown by the wallet in its prompt. */
  appUrl: string
  /** Absolute http(s) URL the wallet redirects back to with its encrypted response. */
  redirectUrl: string
  /** Solana cluster the wallet should connect to. */
  cluster: SolanaCluster
  /**
   * Optional override for navigation. Defaults to `window.location.href = url`.
   * Tests inject a spy to capture the URL without triggering jsdom navigation.
   */
  navigate?: (url: string) => void
  /**
   * Optional override for the Opindex store-fallback scheduler. The default
   * uses a 1500ms `setTimeout` cancelled by a `visibilitychange` listener
   * (page hidden ⇒ wallet intercepted, cancel the fallback). Must return a
   * function the adapter can call to abort the scheduled navigation.
   */
  scheduleFallback?: (params: {
    deepLinkUrl: string
    storeUrl: string
    timeoutMs: number
    navigate: (url: string) => void
  }) => () => void
  /** Override for `Date.now` — exists so tests can assert exact saved state. */
  now?: () => number
}

export interface DeepLinkAdapter {
  /** Last public key returned by a successful `resumeFromCallback`. `null` until then. */
  readonly publicKey: string | null
  /** True after a successful `resumeFromCallback` and until `disconnect()`. */
  readonly isConnected: boolean
  /** True between `connect()` saving state and either `resumeFromCallback()` or `disconnect()`. */
  readonly isConnecting: boolean
  /**
   * Save flow state and navigate to the wallet's deep-link URL. Returns a
   * promise that **never resolves in this page load** — by the time the
   * wallet's response is parseable, the dapp is on a fresh page. The next
   * page must call {@link resumeFromCallback}. Idempotent: a second call
   * while already connecting returns the same pending promise.
   *
   * Rejects synchronously if `requireSignIn` is true but no `signInMessage`
   * is provided (programmer error — caught before any navigation).
   */
  connect(input: DeepLinkConnectInput): Promise<{ publicKey: string }>
  /**
   * On the post-redirect page load, parse the encrypted callback in
   * `window.location` and resolve the flow. Returns `null` if there is no
   * pending state, no callback URL, or the parse fails. Clears pending
   * state on success.
   */
  resumeFromCallback(): CallbackResult | null
  /**
   * Clear local session state. Mobile wallets don't expose a universal
   * disconnect deep link the same way they do for connect, so this is
   * local-only.
   */
  disconnect(): Promise<void>
  /** Out of scope for TASK-108 — throws `WalletNotReadyError`. */
  signMessage(message: Uint8Array): Promise<Uint8Array>
  /** Out of scope for TASK-108 — throws `WalletNotReadyError`. */
  signIn(): Promise<never>
  subscribe(listener: DeepLinkAdapterListener): DeepLinkAdapterUnsubscribe
  /** Idempotent; cancels any pending fallback timer. */
  destroy(): void
}

const DEFAULT_FALLBACK_MS = 1500
const OPINDEX_ID = 'opindex'

/**
 * Build a {@link DeepLinkAdapter} configured for one dapp. Each `connect()`
 * call generates a fresh ephemeral keypair via the
 * {@link "../adapters/deep-link-builder" | DeepLinkBuilder}, persists it
 * via the {@link "../session/store" | SessionStore}, and navigates the page
 * to the wallet. On the post-redirect page load, the dapp (or
 * `WalletManager`) calls `resumeFromCallback()` to decrypt the response.
 */
export function createDeepLinkAdapter(options: DeepLinkAdapterOptions): DeepLinkAdapter {
  const navigate = options.navigate ?? defaultNavigate
  const scheduleFallback = options.scheduleFallback ?? defaultScheduleFallback
  const now = options.now ?? Date.now

  let publicKey: string | null = null
  let isConnected = false
  let isConnecting = false
  let destroyed = false
  let inflightConnect: Promise<{ publicKey: string }> | null = null
  let cancelFallback: (() => void) | null = null

  const listeners = new Set<DeepLinkAdapterListener>()
  const emit = (event: DeepLinkAdapterEvent): void => {
    for (const listener of [...listeners]) {
      try {
        listener(event)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  function assertAlive(): void {
    if (destroyed) throw new Error('DeepLinkAdapter has been destroyed')
  }

  async function connect(input: DeepLinkConnectInput): Promise<{ publicKey: string }> {
    assertAlive()
    if (inflightConnect) return inflightConnect
    if (isConnected && publicKey !== null) return { publicKey }

    const { wallet, requireSignIn = false, signInMessage } = input
    // Synchronous input validation — must happen BEFORE inflightConnect is
    // set, so a programmer-error rejection doesn't wedge subsequent calls.
    if (requireSignIn && !signInMessage) {
      throw new WalletConnectionError(
        'DeepLinkAdapter.connect: requireSignIn=true but no signInMessage was provided',
      )
    }

    // `isConnecting` and `inflightConnect` are committed *inside*
    // `startRedirect` AFTER the URL build succeeds — so a synchronous throw
    // from `buildConnectUrl` (bad redirectUrl/cluster/keypair length) rolls
    // back cleanly without leaving stale state or a wedged inflight slot.
    inflightConnect = startRedirect({ wallet, requireSignIn, signInMessage })
    // We INTENTIONALLY do not clear `inflightConnect` after the promise
    // settles — it never resolves on this page load (we're about to
    // navigate). `resumeFromCallback`, `disconnect`, and `destroy` are the
    // cleanup paths.
    return inflightConnect
  }

  function startRedirect(args: {
    wallet: WalletConfig
    requireSignIn: boolean
    signInMessage: string | undefined
  }): Promise<{ publicKey: string }> {
    const { wallet, requireSignIn, signInMessage } = args
    const keypair = generateEphemeralKeypair()

    // 1. Build the URL FIRST. `buildConnectUrl` / `buildSignAndConnectUrl`
    //    validate redirectUrl, appUrl, cluster, and the keypair length
    //    synchronously. If any of those throw, nothing has been persisted
    //    and `isConnecting` is still false — the consumer's `connect()`
    //    awaiter sees a rejected promise and can retry with corrected
    //    options.
    const buildOpts = {
      redirectUrl: options.redirectUrl,
      appUrl: options.appUrl,
      cluster: options.cluster,
      ephemeralKeypair: keypair,
    }
    const url =
      requireSignIn && signInMessage
        ? buildSignAndConnectUrl(wallet, { ...buildOpts, signInMessage })
        : buildConnectUrl(wallet, buildOpts)

    // 2. Commit pending state + the connecting flag.
    const state = createPendingState({
      walletId: wallet.id,
      requireSignIn,
      ephemeralPublicKey: bs58.encode(keypair.publicKey),
      ephemeralSecretKey: bs58.encode(keypair.secretKey),
      ...(signInMessage !== undefined && { signInMessage }),
    })
    state.timestamp = now()
    savePendingState(state)
    isConnecting = true

    // 3. Navigate (or schedule the Opindex App Store / Play Store probe).
    if (wallet.id === OPINDEX_ID && shouldUseStoreFallback()) {
      const platform = detectPlatform()
      const storeUrl =
        platform.isMobile && userAgentIsAndroid() ? wallet.playStoreUrl : wallet.appStoreUrl
      // Empty store URL would just no-op-navigate after 1500ms; skip the
      // fallback entirely and let the wallet's deep-link intercept be the
      // only outcome.
      if (storeUrl) {
        cancelFallback = scheduleFallback({
          deepLinkUrl: url,
          storeUrl,
          timeoutMs: DEFAULT_FALLBACK_MS,
          navigate,
        })
      } else {
        navigate(url)
      }
    } else {
      navigate(url)
    }

    // Never resolves on this page load.
    return new Promise<{ publicKey: string }>(() => {})
  }

  function resumeFromCallback(): CallbackResult | null {
    assertAlive()
    if (typeof window === 'undefined') return null
    const href = window.location?.href
    if (typeof href !== 'string' || !isCallbackUrl(href)) return null

    const pending = getPendingState()
    if (!pending) return null

    // Defend against pre-TASK-108 PendingState records that lack the
    // keypair fields — bs58.decode(undefined) would throw, but this guard
    // produces a clearer error trail and avoids relying on the catch.
    if (
      typeof pending.ephemeralPublicKey !== 'string' ||
      typeof pending.ephemeralSecretKey !== 'string'
    ) {
      clearPendingState()
      return null
    }

    let keypair: EphemeralKeypair
    try {
      keypair = {
        publicKey: bs58.decode(pending.ephemeralPublicKey),
        secretKey: bs58.decode(pending.ephemeralSecretKey),
      }
    } catch {
      clearPendingState()
      return null
    }

    const result = parseCallback(href, keypair)
    if (!result) {
      // Clear so the user can retry instead of getting wedged for the
      // 10-minute staleness window — happens in the multi-tab race where
      // a callback URL hits the wrong tab's adapter and decryption fails.
      clearPendingState()
      return null
    }

    clearPendingState()
    saveLastUsedWallet(pending.walletId)
    publicKey = result.publicKey
    isConnected = true
    isConnecting = false
    inflightConnect = null
    if (cancelFallback) {
      cancelFallback()
      cancelFallback = null
    }
    emit('connect')
    return result
  }

  async function disconnect(): Promise<void> {
    assertAlive()
    const wasConnected = isConnected
    const wasConnecting = isConnecting
    // Only clear sessionStorage if THIS adapter owned the in-flight or
    // connected flow. SessionStore is a module-level singleton; without
    // this guard, a never-connected adapter calling disconnect() would
    // wipe a sibling adapter's pending state (TASK-109's WalletManager
    // enforces single-adapter-per-tab, but this is a cheap defense).
    if (wasConnected || wasConnecting) {
      clearPendingState()
    }
    publicKey = null
    isConnected = false
    isConnecting = false
    inflightConnect = null
    if (cancelFallback) {
      cancelFallback()
      cancelFallback = null
    }
    if (wasConnected) emit('disconnect')
  }

  async function signMessage(_message: Uint8Array): Promise<Uint8Array> {
    assertAlive()
    throw new WalletNotReadyError(
      'DeepLinkAdapter does not support standalone signMessage. Pass requireSignIn=true to connect() to bundle SIWS into the redirect.',
    )
  }

  async function signIn(): Promise<never> {
    assertAlive()
    throw new WalletNotReadyError(
      'DeepLinkAdapter does not support standalone signIn. Pass requireSignIn=true to connect() to bundle SIWS into the redirect.',
    )
  }

  return {
    get publicKey() {
      return publicKey
    },
    get isConnected() {
      return isConnected
    },
    get isConnecting() {
      return isConnecting
    },
    connect,
    resumeFromCallback,
    disconnect,
    signMessage,
    signIn,
    subscribe(listener) {
      assertAlive()
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      if (cancelFallback) {
        cancelFallback()
        cancelFallback = null
      }
      inflightConnect = null
      listeners.clear()
    },
  }
}

function defaultNavigate(url: string): void {
  if (typeof window === 'undefined') return
  window.location.href = url
}

/**
 * Default Opindex-fallback scheduler. Sets a `timeoutMs` timer; if the page
 * is still visible when it fires (i.e., the OS didn't open the wallet app),
 * navigates to the store URL. A `visibilitychange` to hidden cancels the
 * timer. The deep-link probe itself is triggered immediately via `navigate`.
 */
function defaultScheduleFallback(params: {
  deepLinkUrl: string
  storeUrl: string
  timeoutMs: number
  navigate: (url: string) => void
}): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    params.navigate(params.deepLinkUrl)
    return () => {}
  }
  let cancelled = false
  const onVisibilityChange = (): void => {
    if (document.hidden) cancelled = true
  }
  document.addEventListener('visibilitychange', onVisibilityChange)
  const timer = setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    if (cancelled || document.hidden) return
    params.navigate(params.storeUrl)
  }, params.timeoutMs)
  params.navigate(params.deepLinkUrl)
  return (): void => {
    cancelled = true
    clearTimeout(timer)
    document.removeEventListener('visibilitychange', onVisibilityChange)
  }
}

function shouldUseStoreFallback(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|Android/i.test(navigator.userAgent)
}

function userAgentIsAndroid(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Android/i.test(navigator.userAgent)
}
