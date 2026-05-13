// Portions ported from @solana/wallet-standard-wallet-adapter-base (Apache-2.0). See NOTICE.
// Upstream: https://github.com/anza-xyz/wallet-adapter/blob/master/packages/wallet-standard/wallet-adapter-base/src/wallet.ts
//
// Scope deviation vs. upstream: this adapter intentionally omits
// `sendTransaction` / `signTransaction` / `signAllTransactions` paths.
// Consumers wanting transactions go through `@wallet-standard/app` directly.

import {
  type SolanaSignInFeature,
  type SolanaSignInInput,
  type SolanaSignInOutput,
  SolanaSignIn,
  type SolanaSignMessageFeature,
  SolanaSignMessage,
} from '@solana/wallet-standard-features'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  type StandardConnectFeature,
  StandardConnect,
  type StandardDisconnectFeature,
  StandardDisconnect,
  type StandardEventsFeature,
  StandardEvents,
} from '@wallet-standard/features'

import {
  WalletConnectionError,
  WalletDisconnectionError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletSignInError,
  WalletSignMessageError,
} from '../errors'

/**
 * Lifecycle events a {@link StandardWalletAdapter} subscriber may receive.
 * - `connect`: account list went from empty → non-empty (or `connect` resolved).
 * - `disconnect`: account list became empty, or `disconnect` was called.
 * - `accountsChange`: the connected account changed (e.g., user switched in the wallet UI).
 */
export type StandardAdapterEvent = 'connect' | 'disconnect' | 'accountsChange'

export type StandardAdapterListener = (event: StandardAdapterEvent) => void
export type StandardAdapterUnsubscribe = () => void

export interface StandardWalletAdapter {
  /**
   * Underlying Wallet Standard wallet — useful for transaction code that
   * bypasses this library. **Bypass calls (`wallet.features[...]`) do not
   * update this adapter's internal state**; use the adapter's own methods
   * for connect / signMessage / signIn so subscribers stay in sync.
   */
  readonly wallet: Wallet
  /** Connected account's base58 address (Solana public key), or `null` when disconnected. */
  readonly publicKey: string | null
  readonly isConnected: boolean
  connect(): Promise<{ publicKey: string }>
  disconnect(): Promise<void>
  signMessage(message: Uint8Array): Promise<Uint8Array>
  signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput>
  /**
   * Observe state changes. Listeners fire on transitions only — they do
   * NOT receive the current state on subscribe. If the adapter is
   * pre-authorized (e.g., session restored from a wallet that auto-connects),
   * `isConnected` is already `true` at subscribe time without an event ever
   * having fired; read the getter once before relying on events.
   *
   * Throws if called after {@link destroy}.
   */
  subscribe(listener: StandardAdapterListener): StandardAdapterUnsubscribe
  /** Detach the internal `standard:events` listener and disable further use. Idempotent. */
  destroy(): void
}

/**
 * Adapt a Wallet-Standard {@link Wallet} to a simplified async interface
 * matching this library's needs: `connect`, `disconnect`, `signMessage`,
 * `signIn`, plus a `subscribe` for lifecycle events. The adapter always
 * operates on the first authorized account (`wallet.accounts[0]` after
 * connect); multi-account selection is the consumer's concern.
 *
 * Throws shapes per the ported error taxonomy:
 * - `WalletNotReadyError` — wallet doesn't expose the required feature
 * - `WalletConnectionError` — connect rejected (user cancel, no accounts)
 * - `WalletSignMessageError` — signMessage rejected
 * - `WalletSignInError` — signIn rejected
 * - `WalletDisconnectionError` — disconnect threw and we propagated it
 */
export function createStandardWalletAdapter(wallet: Wallet): StandardWalletAdapter {
  let account: WalletAccount | null = wallet.accounts[0] ?? null
  let isConnected = account !== null
  let destroyed = false
  let inflightConnect: Promise<{ publicKey: string }> | null = null

  const listeners = new Set<StandardAdapterListener>()

  function assertAlive(): void {
    if (destroyed) {
      throw new Error(`Wallet "${wallet.name}" adapter has been destroyed`)
    }
  }
  const emit = (event: StandardAdapterEvent): void => {
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

  const eventsFeature = (wallet.features as Record<string, unknown>)[StandardEvents] as
    | StandardEventsFeature[typeof StandardEvents]
    | undefined
  const detachWalletListener =
    eventsFeature?.on?.('change', (properties) => {
      if (properties.accounts === undefined) return
      const next = properties.accounts[0] ?? null
      const wasConnected = isConnected
      const prevAddress = account?.address ?? null
      account = next
      isConnected = next !== null

      if (next === null && wasConnected) {
        emit('disconnect')
      } else if (next !== null && !wasConnected) {
        emit('connect')
      } else if (next !== null && next.address !== prevAddress) {
        emit('accountsChange')
      }
    }) ?? null

  function requireFeature<T>(symbol: string): T {
    const features = wallet.features as Record<string, unknown>
    const feature = features[symbol] as T | undefined
    if (!feature) {
      throw new WalletNotReadyError(
        `Wallet "${wallet.name}" does not support the '${symbol}' feature`,
      )
    }
    return feature
  }

  async function connect(): Promise<{ publicKey: string }> {
    assertAlive()
    if (account) return { publicKey: account.address }
    // Concurrent callers share one feature.connect() invocation. Prevents
    // double consent prompts and account-overwrite races when two callers
    // (e.g., a button click + an effect) hit connect() in the same tick.
    if (inflightConnect) return inflightConnect

    const feature = requireFeature<StandardConnectFeature[typeof StandardConnect]>(StandardConnect)
    inflightConnect = doConnect(feature)
    try {
      return await inflightConnect
    } finally {
      inflightConnect = null
    }
  }

  async function doConnect(
    feature: StandardConnectFeature[typeof StandardConnect],
  ): Promise<{ publicKey: string }> {
    let result
    try {
      result = await feature.connect()
    } catch (err) {
      throw new WalletConnectionError(
        err instanceof Error ? err.message : `Wallet "${wallet.name}" rejected the connect request`,
        err,
      )
    }

    const first = result.accounts[0]
    if (!first) {
      throw new WalletConnectionError(`Wallet "${wallet.name}" returned no accounts`)
    }

    const wasConnected = isConnected
    account = first
    isConnected = true
    if (!wasConnected) emit('connect')
    return { publicKey: first.address }
  }

  async function disconnect(): Promise<void> {
    assertAlive()
    const features = wallet.features as Record<string, unknown>
    const feature = features[StandardDisconnect] as
      | StandardDisconnectFeature[typeof StandardDisconnect]
      | undefined
    if (feature?.disconnect) {
      try {
        await feature.disconnect()
      } catch (err) {
        throw new WalletDisconnectionError(
          err instanceof Error ? err.message : `Wallet "${wallet.name}" failed to disconnect`,
          err,
        )
      }
    }
    const wasConnected = isConnected
    account = null
    isConnected = false
    if (wasConnected) emit('disconnect')
  }

  async function signMessage(message: Uint8Array): Promise<Uint8Array> {
    assertAlive()
    if (!account) throw new WalletNotConnectedError(`Wallet "${wallet.name}" is not connected`)
    const feature =
      requireFeature<SolanaSignMessageFeature[typeof SolanaSignMessage]>(SolanaSignMessage)

    let outputs: readonly { readonly signature: Uint8Array }[]
    try {
      outputs = await feature.signMessage({ account, message })
    } catch (err) {
      throw new WalletSignMessageError(
        err instanceof Error ? err.message : `Wallet "${wallet.name}" rejected the sign request`,
        err,
      )
    }
    const output = outputs[0]
    if (!output) {
      throw new WalletSignMessageError(`Wallet "${wallet.name}" returned no signature output`)
    }
    return output.signature
  }

  async function signIn(input?: SolanaSignInInput): Promise<SolanaSignInOutput> {
    assertAlive()
    const feature = requireFeature<SolanaSignInFeature[typeof SolanaSignIn]>(SolanaSignIn)

    let outputs: readonly SolanaSignInOutput[]
    try {
      outputs = await feature.signIn(input ?? {})
    } catch (err) {
      throw new WalletSignInError(
        err instanceof Error ? err.message : `Wallet "${wallet.name}" rejected the sign-in request`,
        err,
      )
    }
    const output = outputs[0]
    if (!output) {
      throw new WalletSignInError(`Wallet "${wallet.name}" returned no sign-in output`)
    }

    // signIn implies connect on the wallet side; mirror that here so the
    // caller doesn't have to call connect separately. We trust the wallet's
    // returned `output.account` even though it may not yet appear in
    // `wallet.accounts` — a spec-compliant wallet emits `change` with the
    // new account list immediately after, keeping the two consistent.
    const wasConnected = isConnected
    account = output.account
    isConnected = true
    if (!wasConnected) emit('connect')
    return output
  }

  return {
    get wallet() {
      return wallet
    },
    get publicKey() {
      return account?.address ?? null
    },
    get isConnected() {
      return isConnected
    },
    connect,
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
      if (detachWalletListener) detachWalletListener()
      listeners.clear()
    },
  }
}
