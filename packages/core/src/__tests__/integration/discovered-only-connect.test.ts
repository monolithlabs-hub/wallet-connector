// @vitest-environment jsdom

/**
 * Integration test for the discovered-only connect path: a wallet that is
 * registered with the Wallet Standard registry but NOT listed in
 * `WalletManagerConfig.wallets` should still appear in
 * `manager.getSortedWallets()` (as `source: 'discovered'`) and be
 * connectable via `manager.connect(entry.id)`.
 *
 * Seams: same as `desktop-connect-flow.test.ts` (`navigator.userAgent`
 * stubbed to Mac Chrome, `window.solana` set to a truthy sentinel so
 * `detectPlatform()` resolves to the `extension` strategy).
 */

import {
  type SolanaSignInInput,
  type SolanaSignInOutput,
  SolanaSignMessage,
} from '@solana/wallet-standard-features'
import { getWallets } from '@wallet-standard/app'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardEventsListeners,
} from '@wallet-standard/features'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createWalletManager } from '../../wallet-manager'
import type { WalletConfig } from '../../wallets/sorter'

const MAC_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const BACKPACK_PUBKEY = '22222222222222222222222222222222'

interface FakeWalletControls {
  wallet: Wallet
  connectSpy: ReturnType<typeof vi.fn>
  disconnectSpy: ReturnType<typeof vi.fn>
}

function makeAccount(address: string): WalletAccount {
  return {
    address,
    publicKey: new Uint8Array(32),
    chains: ['solana:mainnet'],
    features: ['solana:signMessage'],
  } as WalletAccount
}

function makeFakeWallet(
  options: {
    name?: string
    connectImpl?: () => Promise<{ accounts: readonly WalletAccount[] }>
    signInImpl?: (input?: SolanaSignInInput) => Promise<readonly SolanaSignInOutput[]>
  } = {},
): FakeWalletControls {
  const { name = 'Backpack' } = options
  const connectSpy = vi.fn(
    options.connectImpl ?? (async () => ({ accounts: [makeAccount(BACKPACK_PUBKEY)] })),
  )
  const disconnectSpy = vi.fn(async () => undefined)

  const features: Record<string, unknown> = {
    [StandardConnect]: { version: '1.0.0', connect: connectSpy },
    [StandardDisconnect]: { version: '1.0.0', disconnect: disconnectSpy },
    [SolanaSignMessage]: {
      version: '1.0.0',
      signMessage: async () => [{ signature: new Uint8Array(64).fill(0x11) }],
    },
    [StandardEvents]: {
      version: '1.0.0',
      on:
        <E extends keyof StandardEventsListeners>(
          _event: E,
          _listener: StandardEventsListeners[E],
        ) =>
        () =>
          undefined,
    },
  }

  const wallet: Wallet = {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,BACKPACK',
    chains: ['solana:mainnet'],
    features: features as Wallet['features'],
    accounts: [],
  } as Wallet

  return { wallet, connectSpy, disconnectSpy }
}

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

const tracker = trackRegistrations()

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: MAC_DESKTOP_UA })
  Object.defineProperty(window, 'solana', {
    value: { isWalletStandard: true },
    configurable: true,
    writable: true,
  })
  localStorage.clear()
})

afterEach(() => {
  tracker.cleanup()
  vi.unstubAllGlobals()
  delete (window as { solana?: unknown }).solana
  localStorage.clear()
})

const PHANTOM_CONFIG: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

describe('Discovered-only wallet connect flow (integration)', () => {
  it('exposes a wallet-standard wallet not in config as a discovered entry', () => {
    const fake = makeFakeWallet({ name: 'Backpack' })
    tracker.register(fake.wallet)

    const manager = createWalletManager({ wallets: [PHANTOM_CONFIG] })
    const sorted = manager.getSortedWallets()

    // Configured (no match) + discovered Backpack.
    expect(sorted).toHaveLength(2)
    const backpack = sorted.find((e) => e.id === 'backpack')
    expect(backpack).toBeDefined()
    expect(backpack).toMatchObject({
      id: 'backpack',
      name: 'Backpack',
      icon: 'data:image/svg+xml;base64,BACKPACK',
      isDetected: true,
      source: 'discovered',
      standardName: 'Backpack',
    })
    // Configured Phantom (no adapter) — source: 'configured', isDetected: false.
    const phantom = sorted.find((e) => e.id === 'phantom')
    expect(phantom).toMatchObject({ source: 'configured', isDetected: false })

    manager.destroy()
  })

  it('connects to a discovered-only wallet via manager.connect(slug)', async () => {
    const fake = makeFakeWallet({ name: 'Backpack' })
    tracker.register(fake.wallet)

    const onConnected = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM_CONFIG],
      onConnected,
      onError,
    })

    await manager.connect('backpack')

    expect(fake.connectSpy).toHaveBeenCalledOnce()
    expect(onError).not.toHaveBeenCalled()
    expect(onConnected).toHaveBeenCalledWith(BACKPACK_PUBKEY)
    expect(manager.getState()).toBe('authenticated')
    expect(manager.getContext().publicKey).toBe(BACKPACK_PUBKEY)
    expect(manager.getContext().walletId).toBe('backpack')
    // Last-used save uses the slugified id; getSortedWallets surfaces this
    // wallet on the next visit even if discovery hasn't re-run.
    expect(localStorage.getItem('lastUsedWallet')).toBe('backpack')

    manager.destroy()
  })

  it('throws WalletConnectionError when the slug matches neither config nor registry', async () => {
    tracker.register(makeFakeWallet({ name: 'Backpack' }).wallet)
    const manager = createWalletManager({ wallets: [PHANTOM_CONFIG] })

    await expect(manager.connect('unknown-wallet')).rejects.toThrow(/not registered/i)

    manager.destroy()
  })

  it('matches a configured wallet by case-insensitive name even when names disagree in case', () => {
    // Adapter registers as 'BACKPACK' (all caps); config uses 'Backpack'.
    const fake = makeFakeWallet({ name: 'BACKPACK' })
    tracker.register(fake.wallet)

    const config: WalletConfig = {
      ...PHANTOM_CONFIG,
      id: 'bp',
      name: 'Backpack',
    }
    const manager = createWalletManager({ wallets: [config] })

    const sorted = manager.getSortedWallets()
    expect(sorted).toHaveLength(1) // No discovered duplicate.
    expect(sorted[0]).toMatchObject({ id: 'bp', isDetected: true, source: 'configured' })

    manager.destroy()
  })

  it('disconnects a discovered-only wallet cleanly', async () => {
    const fake = makeFakeWallet({ name: 'Backpack' })
    tracker.register(fake.wallet)

    const manager = createWalletManager({ wallets: [] })
    await manager.connect('backpack')
    expect(manager.getState()).toBe('authenticated')

    await manager.disconnect()

    expect(fake.disconnectSpy).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('idle')
    expect(manager.getContext().walletId).toBeNull()

    manager.destroy()
  })
})
