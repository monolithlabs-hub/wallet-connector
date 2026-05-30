import {
  createFlowMachine,
  WalletConnectionError,
  type FlowMachine,
  type PlatformInfo,
  type WalletListEntry,
  type WalletManager,
} from '@monolithlabs-hub/wallet-connect-core'
import { act, render, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { WalletConnectContext } from '../context/wallet-connect-context'

import { useWallet } from './use-wallet'

// Hoisted mock for `createWalletManager` — only consumed by the
// owned-manager-path StrictMode tests at the bottom of this file. All
// other tests inject their own fake via `WalletConnectContext.Provider`
// and never hit this code path.
const mocks = vi.hoisted(() => ({
  createWalletManager: vi.fn(),
}))

vi.mock('@monolithlabs-hub/wallet-connect-core', async () => {
  const actual = await vi.importActual<typeof import('@monolithlabs-hub/wallet-connect-core')>(
    '@monolithlabs-hub/wallet-connect-core',
  )
  return {
    ...actual,
    createWalletManager: mocks.createWalletManager,
  }
})

beforeEach(() => {
  mocks.createWalletManager.mockReset()
})

const PHANTOM: WalletListEntry = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  isDetected: false,
  source: 'configured',
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const SOLFLARE: WalletListEntry = {
  id: 'solflare',
  name: 'Solflare',
  priority: 2,
  icon: '',
  isDetected: false,
  source: 'configured',
  deepLinkScheme: 'solflare://',
  universalLink: 'https://solflare.com/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const DEFAULT_PLATFORM: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: true,
  hasOpindexExtension: false,
  strategy: 'extension',
}

interface MockManager {
  manager: WalletManager
  machine: FlowMachine
  initializeSpy: ReturnType<typeof vi.fn>
  connectSpy: ReturnType<typeof vi.fn>
  disconnectSpy: ReturnType<typeof vi.fn>
  signMessageSpy: ReturnType<typeof vi.fn>
  signInSpy: ReturnType<typeof vi.fn>
  unsubscribeSpy: ReturnType<typeof vi.fn>
  /** Mutate to simulate a platform change; call `notify()` to publish. */
  setPlatform(next: PlatformInfo): void
  /** Force a registry-style notification without changing FlowState. */
  notifyRegistryChange(): void
}

function makeMockManager(wallets: WalletListEntry[] = [PHANTOM, SOLFLARE]): MockManager {
  const machine = createFlowMachine()
  const initializeSpy = vi.fn()
  const connectSpy = vi.fn(async () => undefined)
  const disconnectSpy = vi.fn(async () => undefined)
  const signMessageSpy = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const signInSpy = vi.fn()
  const unsubscribeSpy = vi.fn()
  let destroyed = false

  let platform: PlatformInfo = DEFAULT_PLATFORM
  let version = 0
  const listeners = new Set<(state: ReturnType<FlowMachine['getState']>) => void>()
  function notify() {
    version += 1
    const state = machine.getState()
    for (const listener of [...listeners]) listener(state)
  }
  // Fan FlowMachine state changes into the manager's listener set —
  // mirrors the real manager's behavior.
  machine.subscribe(() => notify())

  const manager: WalletManager = {
    initialize: initializeSpy,
    connect: connectSpy,
    disconnect: disconnectSpy,
    signMessage: signMessageSpy,
    signIn: signInSpy,
    signTransaction: vi.fn(async () => new Uint8Array()),
    signAndSendTransaction: vi.fn(async () => ({ signature: new Uint8Array() })),
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    getSortedWallets: () => wallets,
    getPlatform: () => platform,
    getVersion: () => version,
    subscribe: (listener) => {
      // Mirror the real manager's lenient-when-destroyed behavior.
      if (destroyed) return () => {}
      listeners.add(listener)
      return () => {
        unsubscribeSpy()
        listeners.delete(listener)
      }
    },
    isDestroyed: () => destroyed,
    destroy: vi.fn(() => {
      destroyed = true
    }),
  }

  return {
    manager,
    machine,
    initializeSpy,
    connectSpy,
    disconnectSpy,
    signMessageSpy,
    signInSpy,
    unsubscribeSpy,
    setPlatform: (next) => {
      platform = next
    },
    notifyRegistryChange: () => notify(),
  }
}

function makeWrapper(manager: WalletManager, strict = false) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const tree = (
      <WalletConnectContext.Provider value={manager}>{children}</WalletConnectContext.Provider>
    )
    return strict ? <StrictMode>{tree}</StrictMode> : tree
  }
}

describe('useWallet', () => {
  it('returns idle state on mount', () => {
    const { manager } = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(manager) })

    expect(result.current.state).toBe('idle')
    expect(result.current.isConnecting).toBe(false)
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isAuthenticated).toBe(false)
    expect(result.current.publicKey).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('calls manager.initialize() on mount', () => {
    const mock = makeMockManager()
    renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(mock.initializeSpy).toHaveBeenCalledTimes(1)
  })

  it('state updates trigger re-render', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.state).toBe('idle')

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    })

    expect(result.current.state).toBe('connecting')
  })

  it('connect() calls manager.connect() with the selected walletId', async () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    act(() => {
      result.current.select('phantom')
    })

    await act(async () => {
      await result.current.connect()
    })

    expect(mock.connectSpy).toHaveBeenCalledTimes(1)
    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('connect() throws when no wallet has been selected', async () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    await expect(result.current.connect()).rejects.toThrow(WalletConnectionError)
    expect(mock.connectSpy).not.toHaveBeenCalled()
  })

  it('connect(walletId) works without a prior select()', async () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    await act(async () => {
      await result.current.connect('phantom')
    })

    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('select(id) + connect() in the SAME synchronous handler does not stale-close', async () => {
    // Regression test for the stale-closure issue: when select() and
    // connect() are called from the same event handler, `connect()` used
    // to close over the pre-`select` value of `selectedWalletId` and
    // throw. The ref-based selection tracker fixes this by exposing the
    // just-written value synchronously.
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    await act(async () => {
      result.current.select('phantom')
      await result.current.connect()
    })

    expect(mock.connectSpy).toHaveBeenCalledTimes(1)
    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('isConnecting is true while in the connecting state', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    })

    expect(result.current.isConnecting).toBe(true)
    expect(result.current.connecting).toBe(true)
    expect(result.current.isConnected).toBe(false)
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('exposes the SIWS signature on the authenticated transition', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.signature).toBeNull()

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: true,
      })
      mock.machine.send({ type: 'SIGN_INITIATED' })
      mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    })

    expect(result.current.signature).toBe('sig-b58')
  })

  it('signature clears on RESET', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: true,
      })
      mock.machine.send({ type: 'SIGN_INITIATED' })
      mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    })
    expect(result.current.signature).toBe('sig-b58')

    act(() => {
      mock.machine.send({ type: 'RESET' })
    })
    expect(result.current.signature).toBeNull()
  })

  it('isAuthenticated is true after the full flow with requireSignIn=true', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK_FROM_WALLET',
        requireSignIn: true,
      })
      mock.machine.send({ type: 'SIGN_INITIATED' })
      mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    })

    expect(result.current.state).toBe('authenticated')
    expect(result.current.isAuthenticated).toBe(true)
    expect(result.current.isConnected).toBe(true)
    expect(result.current.publicKey).toBe('PK_FROM_WALLET')
    expect(result.current.wallet?.id).toBe('phantom')
  })

  it('is `connected` while in the `signing` state mid-flow', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: true,
      })
      mock.machine.send({ type: 'SIGN_INITIATED' })
    })

    expect(result.current.state).toBe('signing')
    expect(result.current.isSigning).toBe(true)
    // `connected` (and `isConnected`) must be true throughout `signing` —
    // the wallet IS connected, just not yet authenticated. wallet-adapter-react
    // exposes the same semantics.
    expect(result.current.connected).toBe(true)
    expect(result.current.isConnected).toBe(true)
    expect(result.current.isAuthenticated).toBe(false)
  })

  it('error is populated on connection failure', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    const err = new WalletConnectionError('user rejected')
    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({ type: 'ERROR', error: err })
    })

    expect(result.current.state).toBe('error')
    expect(result.current.error).toBe(err)
  })

  it('error clears on RESET', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    const err = new WalletConnectionError('user rejected')
    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({ type: 'ERROR', error: err })
    })
    expect(result.current.error).toBe(err)

    act(() => {
      mock.machine.send({ type: 'RESET' })
    })

    expect(result.current.state).toBe('idle')
    expect(result.current.error).toBeNull()
  })

  it('subscription is cleaned up on unmount', () => {
    const mock = makeMockManager()
    const { unmount } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(mock.unsubscribeSpy).not.toHaveBeenCalled()
    unmount()
    expect(mock.unsubscribeSpy).toHaveBeenCalled()
  })

  it('works in React StrictMode without double-connecting', async () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), {
      wrapper: makeWrapper(mock.manager, true),
    })

    // initialize() is idempotent. In dev StrictMode React mounts twice;
    // the second mount calls initialize() again. The contract is that
    // calling initialize repeatedly is safe — not that it must be called
    // exactly once. Verify the hook still works and connect fires once.
    expect(mock.initializeSpy.mock.calls.length).toBeGreaterThanOrEqual(1)

    act(() => {
      result.current.select('phantom')
    })

    await act(async () => {
      await result.current.connect()
    })

    expect(mock.connectSpy).toHaveBeenCalledTimes(1)
    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('throws when used without a provider and without a config', () => {
    // Capture console.error from React's error boundary path so the test
    // output stays clean.
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => renderHook(() => useWallet())).toThrow(
        /must be used inside a <WalletConnectProvider> or called with a config/,
      )
    } finally {
      errSpy.mockRestore()
    }
  })

  it('select() exposes the chosen wallet via the `wallet` field pre-connect', () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.wallet).toBeNull()

    act(() => {
      result.current.select('solflare')
    })

    expect(result.current.wallet?.id).toBe('solflare')
  })

  it('disconnect() toggles the disconnecting flag around the manager call', async () => {
    const mock = makeMockManager()
    let resolveDisconnect: () => void = () => {}
    mock.disconnectSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDisconnect = resolve
        }),
    )
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.disconnecting).toBe(false)

    let pending: Promise<void>
    act(() => {
      pending = result.current.disconnect()
    })

    expect(result.current.disconnecting).toBe(true)

    await act(async () => {
      resolveDisconnect()
      await pending
    })

    expect(result.current.disconnecting).toBe(false)
  })

  it('exposes sortedWallets from the manager', () => {
    const mock = makeMockManager([SOLFLARE, PHANTOM])
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.sortedWallets.map((w) => w.id)).toEqual(['solflare', 'phantom'])
  })

  it('connect() forwards an unknown selected walletId to the manager unchanged', async () => {
    // The hook does NOT validate that the selected wallet is in
    // `sortedWallets` — validation belongs to the manager (which throws
    // `WalletConnectionError` for an unregistered id). This test pins
    // the pass-through behavior so future changes don't silently start
    // swallowing the id. Pre-connect, `wallet` is null because the id
    // doesn't match anything in `sortedWallets`.
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    act(() => {
      result.current.select('not-a-real-wallet')
    })

    expect(result.current.wallet).toBeNull()

    await act(async () => {
      await result.current.connect()
    })

    expect(mock.connectSpy).toHaveBeenCalledWith('not-a-real-wallet')
  })

  it('signMessage and signIn delegate to the manager', async () => {
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })
    const message = new Uint8Array([9, 8, 7])

    await act(async () => {
      await result.current.signMessage(message)
    })

    expect(mock.signMessageSpy).toHaveBeenCalledWith(message)

    await act(async () => {
      await result.current.signIn({ domain: 'example.com' })
    })

    expect(mock.signInSpy).toHaveBeenCalledWith({ domain: 'example.com' })
  })

  it('exposes platform from the manager', () => {
    const mock = makeMockManager()
    mock.setPlatform({ ...DEFAULT_PLATFORM, hasOpindexExtension: true })
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.platform.hasOpindexExtension).toBe(true)
  })

  it('re-renders when the manager fires a registry-only notification', () => {
    // A Wallet Standard `register` event bumps the manager's version
    // without changing FlowState. The hook still has to re-render so
    // `platform` and `sortedWallets` reflect the new registry.
    const mock = makeMockManager()
    const { result } = renderHook(() => useWallet(), { wrapper: makeWrapper(mock.manager) })

    expect(result.current.platform.hasOpindexExtension).toBe(false)

    act(() => {
      mock.setPlatform({ ...DEFAULT_PLATFORM, hasOpindexExtension: true })
      mock.notifyRegistryChange()
    })

    expect(result.current.platform.hasOpindexExtension).toBe(true)
  })

  it('owned-manager path survives a React StrictMode mount cycle', () => {
    // useWallet(config) self-owns a manager. Under StrictMode the effect
    // cleanup destroys it mid-cycle; the second mount must detect that
    // and rebuild via `createWalletManager` rather than calling
    // `initialize()` / `subscribe()` on a dead instance.
    //
    // StrictMode double-invokes useState lazy initializers + setState
    // updaters for purity checks, so createWalletManager is called more
    // than twice. Invariants we care about:
    //   - Rebuild happened (>= 2 distinct managers created).
    //   - At least one earlier manager was destroyed.
    //   - The final live manager has its `initialize()` called.
    //
    // Uses `render(...)` rather than `renderHook(...)` because the latter
    // doesn't synchronously complete StrictMode's effect cleanup-then-
    // rerun cycle before returning under React 19 + @testing-library 16.
    const created: ReturnType<typeof makeMockManager>[] = []
    mocks.createWalletManager.mockImplementation(() => {
      const m = makeMockManager()
      created.push(m)
      return m.manager
    })

    let observedState: string | null = null
    function HookProbe() {
      const w = useWallet({ wallets: [] })
      observedState = w.state
      return null
    }

    render(
      <StrictMode>
        <HookProbe />
      </StrictMode>,
    )

    expect(created.length).toBeGreaterThanOrEqual(2)
    expect(created.some((m) => m.manager.isDestroyed())).toBe(true)
    const finalAlive = created.filter((m) => !m.manager.isDestroyed())
    expect(finalAlive.length).toBeGreaterThanOrEqual(1)
    // The final live manager has been initialized.
    expect(finalAlive[finalAlive.length - 1]?.initializeSpy).toHaveBeenCalled()
    expect(observedState).toBe('idle')
  })
})
