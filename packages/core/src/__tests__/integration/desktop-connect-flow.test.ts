// @vitest-environment jsdom

/**
 * Integration tests for the full desktop extension connect flow.
 *
 * These exercise the **real** WalletManager + StandardWalletAdapter +
 * FlowMachine + Wallet-Standard discovery stack. The wallet is simulated
 * via a controllable Wallet-Standard `Wallet` object registered with the
 * global registry — the same code path real Phantom / Solflare / Backpack
 * extensions use. No mocks at the manager or adapter level.
 *
 * Seams mocked:
 *
 * - `navigator.userAgent` — stubbed to a Mac Chrome UA so `detectPlatform`
 *   resolves to the `extension` strategy.
 * - `window.solana` — set to a truthy sentinel so `detectPlatform` sees an
 *   extension present (any extension would inject this).
 * - `localStorage` — real jsdom instance, cleared between tests.
 *
 * Pairs with `mobile-connect-flow.test.ts`. Same authenticity goal: cover
 * the real connect / sign / error / disconnect paths from the manager API
 * down to the wallet feature calls.
 */

import {
  SolanaSignIn,
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
import bs58 from 'bs58'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  WalletConnectionError,
  WalletNotConnectedError,
  WalletSignMessageError,
} from '../../errors'
import type { FlowState } from '../../state/machine'
import { createWalletManager } from '../../wallet-manager'
import type { WalletConfig } from '../../wallets/sorter'

// --- Fixtures ------------------------------------------------------------

const MAC_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const PHANTOM_PUBKEY = '11111111111111111111111111111111'

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

// --- Fake Wallet-Standard wallet -----------------------------------------

interface FakeWalletControls {
  wallet: Wallet
  /**
   * Trigger the `standard:events` `change` listener — used to simulate
   * the wallet emitting account / chain / feature changes. Mirrors the
   * helper in `standard-wallet-adapter.test.ts`.
   */
  emitChange: (props: Parameters<StandardEventsListeners['change']>[0]) => void
  connectSpy: ReturnType<typeof vi.fn>
  signMessageSpy: ReturnType<typeof vi.fn>
  signInSpy: ReturnType<typeof vi.fn>
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
    signMessageImpl?: () => Promise<readonly { signature: Uint8Array }[]>
    signInImpl?: (input?: SolanaSignInInput) => Promise<readonly SolanaSignInOutput[]>
    disconnectImpl?: () => Promise<void>
    withSignIn?: boolean
  } = {},
): FakeWalletControls {
  const { name = 'Phantom', withSignIn = false } = options

  const accounts: WalletAccount[] = []
  const changeListeners = new Set<StandardEventsListeners['change']>()

  const connectSpy = vi.fn(
    options.connectImpl ?? (async () => ({ accounts: [makeAccount(PHANTOM_PUBKEY)] })),
  )
  const signMessageSpy = vi.fn(
    options.signMessageImpl ?? (async () => [{ signature: new Uint8Array(64).fill(0x11) }]),
  )
  const signInSpy = vi.fn(
    options.signInImpl ??
      (async () => [
        {
          account: makeAccount(PHANTOM_PUBKEY),
          signedMessage: new Uint8Array(0),
          signature: new Uint8Array(64).fill(0x22),
        } as SolanaSignInOutput,
      ]),
  )
  const disconnectSpy = vi.fn(options.disconnectImpl ?? (async () => undefined))

  const features: Record<string, unknown> = {
    [StandardConnect]: { version: '1.0.0', connect: connectSpy },
    [StandardDisconnect]: { version: '1.0.0', disconnect: disconnectSpy },
    [SolanaSignMessage]: { version: '1.0.0', signMessage: signMessageSpy },
    [StandardEvents]: {
      version: '1.0.0',
      on: <E extends keyof StandardEventsListeners>(
        event: E,
        listener: StandardEventsListeners[E],
      ) => {
        if (event !== 'change') return () => undefined
        changeListeners.add(listener as StandardEventsListeners['change'])
        return () => {
          changeListeners.delete(listener as StandardEventsListeners['change'])
        }
      },
    },
  }
  if (withSignIn) {
    features[SolanaSignIn] = { version: '1.0.0', signIn: signInSpy }
  }

  const wallet: Wallet = {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,',
    chains: ['solana:mainnet'],
    features: features as Wallet['features'],
    accounts,
  } as Wallet

  return {
    wallet,
    connectSpy,
    signMessageSpy,
    signInSpy,
    disconnectSpy,
    emitChange(props) {
      for (const listener of [...changeListeners]) listener(props)
    },
  }
}

/**
 * Register wallets in the Wallet-Standard registry; return a function
 * that unregisters them all. Same pattern as `discovery.test.ts`.
 */
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

// --- Setup / teardown ----------------------------------------------------

const tracker = trackRegistrations()

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: MAC_DESKTOP_UA })
  // Make `detectPlatform()` resolve to the `extension` strategy — it
  // only checks for truthy `window.solana`, so any sentinel works.
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
  delete (window as any).solana
  localStorage.clear()
})

// --- Tests ---------------------------------------------------------------

describe('Desktop extension connect flow (integration)', () => {
  it('connect → extension popup approved → onConnected fired', async () => {
    const fake = makeFakeWallet({ name: 'Phantom' })
    tracker.register(fake.wallet)

    const onConnected = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM_CONFIG],
      onConnected,
      onError,
    })

    const stateChanges: FlowState[] = []
    manager.subscribe((state) => stateChanges.push(state))

    await manager.connect('phantom')

    expect(fake.connectSpy).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith(PHANTOM_PUBKEY)
    expect(onError).not.toHaveBeenCalled()
    expect(manager.getState()).toBe('authenticated') // auto-step on requireSignIn=false
    expect(manager.getContext().publicKey).toBe(PHANTOM_PUBKEY)
    expect(stateChanges).toEqual(['connecting', 'connected', 'authenticated'])
    // Manager records the wallet for next visit's sorter pinning.
    expect(localStorage.getItem('lastUsedWallet')).toBe('phantom')

    manager.destroy()
  })

  it('connect → extension popup rejected → onError fired with WalletConnectionError', async () => {
    const fake = makeFakeWallet({
      name: 'Phantom',
      // Simulate the user clicking "Reject" in the extension popup —
      // the standard:connect feature throws.
      connectImpl: async () => {
        throw new Error('User rejected the request')
      },
    })
    tracker.register(fake.wallet)

    const onConnected = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM_CONFIG],
      onConnected,
      onError,
    })

    await expect(manager.connect('phantom')).rejects.toBeInstanceOf(WalletConnectionError)

    expect(fake.connectSpy).toHaveBeenCalledOnce()
    expect(onConnected).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(WalletConnectionError)
    expect(manager.getState()).toBe('error')
    expect(manager.getContext().error).toBeInstanceOf(WalletConnectionError)
    // `lastUsedWallet` must NOT be persisted on a failed connect — the
    // manager calls `saveLastUsedWallet` only AFTER `WALLET_CONNECTED`
    // succeeds. Regression vector: a future change that bumps the
    // pinning before the success check would silently poison the
    // sorter for subsequent sessions.
    expect(localStorage.getItem('lastUsedWallet')).toBeNull()

    manager.destroy()
  })

  it('connect + sign (requireSignIn: true) → onAuthenticated fired with the signature', async () => {
    const expectedSignatureBytes = new Uint8Array(64).fill(0xaa)
    const fake = makeFakeWallet({
      name: 'Phantom',
      signMessageImpl: async () => [{ signature: expectedSignatureBytes }],
    })
    tracker.register(fake.wallet)

    const onConnected = vi.fn()
    const onAuthenticated = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM_CONFIG],
      requireSignIn: true,
      signInMessage: (pk) => `Sign in to dapp as ${pk}`,
      onConnected,
      onAuthenticated,
      onError,
    })

    // Subscribe BEFORE connect to capture the full SIWS state sequence.
    // Distinguishes the four-state SIWS path from the three-state
    // non-SIWS path in test #1 — a future change that drops the
    // SIGN_INITIATED → SIGN_COMPLETED hop and jumps `connected →
    // authenticated` directly would still pass the terminal-state
    // assertion, but trip this one.
    const stateChanges: FlowState[] = []
    manager.subscribe((state) => stateChanges.push(state))

    await manager.connect('phantom')

    expect(onConnected).toHaveBeenCalledWith(PHANTOM_PUBKEY)
    expect(fake.signMessageSpy).toHaveBeenCalledOnce()
    expect(onAuthenticated).toHaveBeenCalledOnce()
    // Manager base58-encodes the raw signature bytes before emission;
    // assert the EXACT encoding so a future drift in encoding (raw
    // hex, base64, etc.) trips the test instead of silently shipping.
    const expectedSignatureB58 = bs58.encode(expectedSignatureBytes)
    expect(onAuthenticated).toHaveBeenCalledWith(PHANTOM_PUBKEY, expectedSignatureB58)
    expect(onError).not.toHaveBeenCalled()
    expect(manager.getState()).toBe('authenticated')
    expect(manager.getContext().signature).toBe(expectedSignatureB58)
    expect(stateChanges).toEqual(['connecting', 'connected', 'signing', 'authenticated'])

    // Verify the SIWS message was the dapp-provided one (with the
    // connected public key interpolated).
    const signMessageCall = fake.signMessageSpy.mock.calls[0]?.[0] as {
      account: WalletAccount
      message: Uint8Array
    }
    expect(new TextDecoder().decode(signMessageCall.message)).toBe(
      `Sign in to dapp as ${PHANTOM_PUBKEY}`,
    )

    manager.destroy()
  })

  it('sign rejected → onError fired with WalletSignMessageError', async () => {
    const fake = makeFakeWallet({
      name: 'Phantom',
      // Connect approves, but the user rejects the SIWS prompt.
      signMessageImpl: async () => {
        throw new Error('User rejected the sign request')
      },
    })
    tracker.register(fake.wallet)

    const onConnected = vi.fn()
    const onAuthenticated = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM_CONFIG],
      requireSignIn: true,
      signInMessage: () => 'Sign in',
      onConnected,
      onAuthenticated,
      onError,
    })

    await expect(manager.connect('phantom')).rejects.toBeInstanceOf(WalletSignMessageError)

    // Connect succeeded — onConnected still fires before the sign step
    // attempts (and fails).
    expect(onConnected).toHaveBeenCalledWith(PHANTOM_PUBKEY)
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledOnce()
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(WalletSignMessageError)
    expect(manager.getState()).toBe('error')

    manager.destroy()
  })

  it('unexpected disconnect (wallet emits change with empty accounts) handled gracefully', async () => {
    // Establish a connected session.
    const fake = makeFakeWallet({ name: 'Phantom' })
    tracker.register(fake.wallet)

    const onConnected = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM_CONFIG],
      onConnected,
    })

    await manager.connect('phantom')
    expect(onConnected).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('authenticated')

    // Simulate the wallet emitting a `change` event with an empty
    // accounts list — what happens when the user clicks "Disconnect"
    // inside the extension's own UI, or revokes the dapp's permission.
    // The StandardWalletAdapter clears its internal `account` reference;
    // the manager doesn't subscribe to adapter events (by design — the
    // adapter is queried lazily for sign operations).
    fake.emitChange({ accounts: [] })

    // **Design pin**: the manager does NOT observe adapter lifecycle
    // events. From the FlowMachine's POV, we're still `authenticated`
    // until the user explicitly calls `manager.disconnect()`. A future
    // change that wires the manager up to adapter `disconnect` events
    // would flip the state to `idle` here and trip these assertions —
    // forcing a conscious decision rather than silent behavior drift.
    expect(manager.getState()).toBe('authenticated')
    expect(manager.getContext().publicKey).toBe(PHANTOM_PUBKEY)
    expect(manager.getContext().walletId).toBe('phantom')

    // The disconnected state surfaces only when a downstream operation
    // reaches the adapter — `requireConnectedStandardAdapter` →
    // `adapter.signMessage` → adapter's `if (!account) throw
    // WalletNotConnectedError` path.
    await expect(manager.signMessage(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      WalletNotConnectedError,
    )

    manager.destroy()
  })
})
