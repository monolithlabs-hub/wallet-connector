import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  StandardConnect,
  StandardEvents,
  type StandardEventsListeners,
} from '@wallet-standard/features'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { discoverStandardWallets } from './discovery'

const PUBKEY = '11111111111111111111111111111111'

function makeAccount(): WalletAccount {
  return {
    address: PUBKEY,
    publicKey: new Uint8Array(32),
    chains: ['solana:mainnet'],
    features: ['solana:signMessage'],
  } as WalletAccount
}

function makeWallet(opts: {
  name: string
  chains?: `${string}:${string}`[]
  hasConnect?: boolean
  hasEvents?: boolean
}): Wallet {
  const { name, chains = ['solana:mainnet'], hasConnect = true, hasEvents = true } = opts
  const features: Record<string, unknown> = {}
  if (hasEvents) {
    features[StandardEvents] = {
      version: '1.0.0',
      on:
        <E extends keyof StandardEventsListeners>(
          _event: E,
          _listener: StandardEventsListeners[E],
        ) =>
        () => {},
    }
  }
  if (hasConnect) {
    features[StandardConnect] = {
      version: '1.0.0',
      connect: async () => ({ accounts: [makeAccount()] }),
    }
  }
  return {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,',
    chains,
    features: features as Wallet['features'],
    accounts: [],
  } as Wallet
}

// Each test registers wallets into the global Wallet Standard registry and
// unregisters them at the end so subsequent tests get a clean slate.
function trackRegistrations(): {
  register: (...wallets: Wallet[]) => void
  cleanup: () => void
} {
  const registry = getWallets()
  const unregisters: (() => void)[] = []
  return {
    register: (...wallets) => {
      unregisters.push(registry.register(...wallets))
    },
    cleanup: () => {
      for (const off of unregisters) off()
      unregisters.length = 0
    },
  }
}

describe('discoverStandardWallets', () => {
  const tracker = trackRegistrations()

  afterEach(() => {
    tracker.cleanup()
  })

  it('enumerates wallets registered before subscribe()', () => {
    const phantom = makeWallet({ name: 'Phantom' })
    const solflare = makeWallet({ name: 'Solflare' })
    tracker.register(phantom, solflare)

    const handle = discoverStandardWallets()
    const names = handle.getAdapters().map((a) => a.wallet.name)

    expect(names).toContain('Phantom')
    expect(names).toContain('Solflare')
    handle.destroy()
  })

  it('emits new adapters when a wallet registers after subscribe()', () => {
    const handle = discoverStandardWallets()
    const listener = vi.fn()
    handle.subscribe(listener)

    const lateWallet = makeWallet({ name: 'LateWallet' })
    tracker.register(lateWallet)

    expect(listener).toHaveBeenCalledTimes(1)
    const lastCall = listener.mock.calls[listener.mock.calls.length - 1] as [unknown[]]
    const names = (lastCall[0] as { wallet: Wallet }[]).map((a) => a.wallet.name)
    expect(names).toContain('LateWallet')
    handle.destroy()
  })

  it('emits an updated list when a wallet unregisters', () => {
    const phantom = makeWallet({ name: 'PhantomGoodbye' })
    let phantomOff: (() => void) | undefined
    {
      const registry = getWallets()
      phantomOff = registry.register(phantom)
    }
    const handle = discoverStandardWallets()
    expect(handle.getAdapters().some((a) => a.wallet.name === 'PhantomGoodbye')).toBe(true)
    const listener = vi.fn()
    handle.subscribe(listener)

    phantomOff?.()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(handle.getAdapters().some((a) => a.wallet.name === 'PhantomGoodbye')).toBe(false)
    handle.destroy()
  })

  it('filters out wallets that lack standard:connect', () => {
    const broken = makeWallet({ name: 'NoConnectWallet', hasConnect: false })
    tracker.register(broken)

    const handle = discoverStandardWallets()
    const names = handle.getAdapters().map((a) => a.wallet.name)

    expect(names).not.toContain('NoConnectWallet')
    handle.destroy()
  })

  it('filters out wallets that have no solana:* chain', () => {
    const ethereum = makeWallet({ name: 'EthereumWallet', chains: ['ethereum:1'] })
    tracker.register(ethereum)

    const handle = discoverStandardWallets()
    const names = handle.getAdapters().map((a) => a.wallet.name)

    expect(names).not.toContain('EthereumWallet')
    handle.destroy()
  })

  it('filters out wallets that lack standard:events', () => {
    // Without events, the adapter's subscribe() would silently never fire —
    // that's a contract violation, so the filter excludes such wallets.
    const noEvents = makeWallet({ name: 'NoEventsWallet', hasEvents: false })
    tracker.register(noEvents)

    const handle = discoverStandardWallets()
    const names = handle.getAdapters().map((a) => a.wallet.name)

    expect(names).not.toContain('NoEventsWallet')
    handle.destroy()
  })

  it('does not duplicate adapters when the same wallet is registered twice', () => {
    const phantom = makeWallet({ name: 'PhantomTwice' })
    tracker.register(phantom)
    const handle = discoverStandardWallets()
    expect(handle.getAdapters().filter((a) => a.wallet.name === 'PhantomTwice')).toHaveLength(1)

    // Re-register the SAME wallet object — should be a no-op for the adapter cache.
    tracker.register(phantom)
    expect(handle.getAdapters().filter((a) => a.wallet.name === 'PhantomTwice')).toHaveLength(1)
    handle.destroy()
  })

  it('destroy() stops emitting and detaches from the registry', () => {
    const handle = discoverStandardWallets()
    const listener = vi.fn()
    handle.subscribe(listener)
    handle.destroy()

    tracker.register(makeWallet({ name: 'AfterDestroy' }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('destroy() is idempotent', () => {
    const handle = discoverStandardWallets()

    expect(() => {
      handle.destroy()
      handle.destroy()
    }).not.toThrow()
  })

  it('subscribe returns an unsubscribe function that detaches the listener', () => {
    const handle = discoverStandardWallets()
    const listener = vi.fn()
    const unsubscribe = handle.subscribe(listener)
    unsubscribe()

    tracker.register(makeWallet({ name: 'AfterUnsubscribe' }))

    expect(listener).not.toHaveBeenCalled()
    handle.destroy()
  })

  it('isolates a throwing subscribe listener via queueMicrotask', () => {
    const original = globalThis.queueMicrotask
    const captured: unknown[] = []
    globalThis.queueMicrotask = (fn) => {
      try {
        fn()
      } catch (err) {
        captured.push(err)
      }
    }
    try {
      const handle = discoverStandardWallets()
      const bad = vi.fn(() => {
        throw new Error('discovery listener exploded')
      })
      const good = vi.fn()
      handle.subscribe(bad)
      handle.subscribe(good)

      tracker.register(makeWallet({ name: 'TriggerNotify' }))

      expect(bad).toHaveBeenCalledOnce()
      expect(good).toHaveBeenCalledOnce()
      expect(captured).toHaveLength(1)
      expect((captured[0] as Error).message).toBe('discovery listener exploded')
      handle.destroy()
    } finally {
      globalThis.queueMicrotask = original
    }
  })
})
