// Portions ported from @solana/wallet-standard-wallet-adapter-base (Apache-2.0). See NOTICE.
// Upstream: https://github.com/anza-xyz/wallet-adapter/blob/master/packages/wallet-standard/wallet-adapter-base/src/standard.ts
// (`isWalletAdapterCompatibleStandardWallet` helper)
//
// Scope deviation vs. upstream: the upstream filter requires the wallet to
// expose at least one transaction-signing feature. This library skips
// transactions (see TASK-107's scope note), so the filter here only requires
// `standard:connect` plus a `solana:*` chain. Wallets that don't expose
// `solana:signMessage` / `solana:signIn` can still be discovered; the
// `StandardWalletAdapter` throws `WalletNotReadyError` at call time.

import { getWallets } from '@wallet-standard/app'
import type { Wallet } from '@wallet-standard/base'
import { StandardConnect, StandardEvents } from '@wallet-standard/features'

import {
  createStandardWalletAdapter,
  type StandardWalletAdapter,
} from './adapters/standard-wallet-adapter'

export type DiscoveryListener = (adapters: readonly StandardWalletAdapter[]) => void
export type DiscoveryUnsubscribe = () => void

export interface DiscoveryHandle {
  /** Snapshot of adapters currently in the registry. */
  getAdapters(): readonly StandardWalletAdapter[]
  /**
   * Observe the live list. Listener is called whenever a compatible wallet
   * is registered or unregistered. Not called for the initial snapshot —
   * read it via {@link getAdapters} after subscribing.
   */
  subscribe(listener: DiscoveryListener): DiscoveryUnsubscribe
  /**
   * Detach from the Wallet Standard registry and destroy all adapters.
   * Idempotent.
   */
  destroy(): void
}

/**
 * Subscribe to the Wallet Standard registry and return a live, deduplicated
 * list of {@link StandardWalletAdapter} instances — one per compatible
 * wallet. Picks up wallets registered before the call (`getWallets().get()`)
 * AND late-registered wallets (`register` event). Unregistration removes the
 * adapter and destroys it.
 *
 * **Each call creates a fresh handle and a fresh adapter set.** Two callers
 * to `discoverStandardWallets()` get independent adapter caches and each
 * adapter attaches its own `standard:events.change` listener to every wallet,
 * doubling the fan-out. For app-wide use, call once and share the returned
 * handle. The `WalletManager` (TASK-109) is the canonical singleton owner.
 */
export function discoverStandardWallets(): DiscoveryHandle {
  const adapters = new Map<Wallet, StandardWalletAdapter>()
  const listeners = new Set<DiscoveryListener>()
  const registry = getWallets()

  const addWallets = (wallets: readonly Wallet[]): void => {
    let changed = false
    for (const wallet of wallets) {
      if (adapters.has(wallet)) continue
      if (!isCompatibleStandardWallet(wallet)) continue
      adapters.set(wallet, createStandardWalletAdapter(wallet))
      changed = true
    }
    if (changed) notify()
  }

  const removeWallets = (wallets: readonly Wallet[]): void => {
    let changed = false
    for (const wallet of wallets) {
      const adapter = adapters.get(wallet)
      if (!adapter) continue
      adapter.destroy()
      adapters.delete(wallet)
      changed = true
    }
    if (changed) notify()
  }

  const notify = (): void => {
    const snapshot = Array.from(adapters.values())
    for (const listener of [...listeners]) {
      try {
        listener(snapshot)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  // Seed with already-registered wallets.
  addWallets(registry.get())

  const offRegister = registry.on('register', (...wallets) => addWallets(wallets))
  const offUnregister = registry.on('unregister', (...wallets) => removeWallets(wallets))

  let destroyed = false
  return {
    getAdapters: () => Array.from(adapters.values()),
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    destroy() {
      if (destroyed) return
      destroyed = true
      offRegister()
      offUnregister()
      for (const adapter of adapters.values()) adapter.destroy()
      adapters.clear()
      listeners.clear()
    },
  }
}

/**
 * Filter applied during discovery. Ported (and trimmed) from
 * `@solana/wallet-standard-wallet-adapter-base`'s
 * `isWalletAdapterCompatibleStandardWallet`. We require:
 *
 * - `standard:connect` feature (mandatory for any connect flow)
 * - `standard:events` feature (mandatory so `subscribe` actually fires —
 *   without it the adapter's event surface is dead, which is a contract
 *   violation from the consumer's vantage)
 * - at least one `solana:*` chain
 *
 * Notably absent: `solana:signTransaction` / `solana:signAndSendTransaction`.
 * Those are upstream's hard requirement but out of scope here. Wallets that
 * lack them are still discoverable; the dapp uses `@wallet-standard/app`
 * directly for transactions if it needs them.
 */
function isCompatibleStandardWallet(wallet: Wallet): boolean {
  const features = wallet.features as Record<string, unknown>
  if (!(StandardConnect in features)) return false
  if (!(StandardEvents in features)) return false
  return wallet.chains.some((chain) => chain.startsWith('solana:'))
}
