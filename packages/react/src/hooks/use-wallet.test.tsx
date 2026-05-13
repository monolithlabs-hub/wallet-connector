import {
  createFlowMachine,
  WalletConnectionError,
  type FlowMachine,
  type WalletConfig,
  type WalletManager,
} from '@monolithlabs/wallet-connect-core'
import { act, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { WalletConnectContext } from '../context/wallet-connect-context'

import { useWallet } from './use-wallet'

const PHANTOM: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const SOLFLARE: WalletConfig = {
  id: 'solflare',
  name: 'Solflare',
  priority: 2,
  icon: '',
  deepLinkScheme: 'solflare://',
  universalLink: 'https://solflare.com/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
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
}

function makeMockManager(wallets: WalletConfig[] = [PHANTOM, SOLFLARE]): MockManager {
  const machine = createFlowMachine()
  const initializeSpy = vi.fn()
  const connectSpy = vi.fn(async () => undefined)
  const disconnectSpy = vi.fn(async () => undefined)
  const signMessageSpy = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const signInSpy = vi.fn()
  const unsubscribeSpy = vi.fn()

  const manager: WalletManager = {
    initialize: initializeSpy,
    connect: connectSpy,
    disconnect: disconnectSpy,
    signMessage: signMessageSpy,
    signIn: signInSpy,
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    getSortedWallets: () => wallets,
    subscribe: (listener) => {
      const real = machine.subscribe(listener)
      return () => {
        unsubscribeSpy()
        real()
      }
    },
    destroy: vi.fn(),
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
})
