import {
  createFlowMachine,
  type FlowMachine,
  type WalletManager,
  type WalletManagerConfig,
} from '@monolithlabs/wallet-connect-core'
import { render, renderHook } from '@testing-library/react'
import { type ReactNode, useEffect, useRef } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useWallet } from '../hooks/use-wallet'

import { useWalletContext } from './use-wallet-context'
import { WalletConnectProvider } from './wallet-connect-provider'

// --- Module mock ---------------------------------------------------------

const mocks = vi.hoisted(() => ({
  createWalletManager: vi.fn(),
}))

vi.mock('@monolithlabs/wallet-connect-core', async () => {
  const actual = await vi.importActual<typeof import('@monolithlabs/wallet-connect-core')>(
    '@monolithlabs/wallet-connect-core',
  )
  return {
    ...actual,
    createWalletManager: mocks.createWalletManager,
  }
})

// --- Helpers -------------------------------------------------------------

interface FakeManager {
  manager: WalletManager
  machine: FlowMachine
  destroySpy: ReturnType<typeof vi.fn>
}

function makeFakeManager(): FakeManager {
  const machine = createFlowMachine()
  const destroySpy = vi.fn()
  const manager: WalletManager = {
    initialize: vi.fn(),
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    signMessage: vi.fn(async () => new Uint8Array()),
    signIn: vi.fn(),
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    getSortedWallets: () => [],
    subscribe: (listener) => machine.subscribe(listener),
    destroy: destroySpy,
  }
  return { manager, machine, destroySpy }
}

const DUMMY_CONFIG: WalletManagerConfig = { wallets: [] }

beforeEach(() => {
  vi.clearAllMocks()
})

// --- Tests ---------------------------------------------------------------

describe('WalletConnectProvider', () => {
  it('provides the manager instance to children via context', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const { result } = renderHook(() => useWalletContext(), {
      wrapper: ({ children }) => (
        <WalletConnectProvider config={DUMMY_CONFIG}>{children}</WalletConnectProvider>
      ),
    })

    expect(result.current).toBe(fake.manager)
  })

  it('useWallet() reads the manager from the provider', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const { result } = renderHook(() => useWallet(), {
      wrapper: ({ children }) => (
        <WalletConnectProvider config={DUMMY_CONFIG}>{children}</WalletConnectProvider>
      ),
    })

    // initialize() is invoked on mount by useWallet — that's the cleanest
    // observable signal that the manager from the provider is the one
    // useWallet picked up.
    expect(fake.manager.initialize).toHaveBeenCalledTimes(1)
    expect(result.current.state).toBe('idle')
  })

  it('creates a single manager regardless of how many consumers subscribe', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    function Consumer({ onMount }: { onMount: (m: WalletManager) => void }) {
      const manager = useWalletContext()
      const fired = useRef(false)
      useEffect(() => {
        if (!fired.current) {
          fired.current = true
          onMount(manager)
        }
      }, [manager, onMount])
      return null
    }

    const observed: WalletManager[] = []
    render(
      <WalletConnectProvider config={DUMMY_CONFIG}>
        <Consumer onMount={(m) => observed.push(m)} />
        <Consumer onMount={(m) => observed.push(m)} />
        <Consumer onMount={(m) => observed.push(m)} />
      </WalletConnectProvider>,
    )

    expect(mocks.createWalletManager).toHaveBeenCalledTimes(1)
    expect(observed).toHaveLength(3)
    expect(new Set(observed).size).toBe(1)
    expect(observed[0]).toBe(fake.manager)
  })

  it('throws a descriptive error when useWalletContext is used without a Provider', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => renderHook(() => useWalletContext())).toThrow(
        /must be used inside a <WalletConnectProvider>/,
      )
    } finally {
      errSpy.mockRestore()
    }
  })

  it('throws a descriptive error when useWallet is used without a Provider or config', () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => renderHook(() => useWallet())).toThrow(
        /must be used inside a <WalletConnectProvider> or called with a config/,
      )
    } finally {
      errSpy.mockRestore()
    }
  })

  it('renders children without wrapping them in a DOM element', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const { container } = render(
      <WalletConnectProvider config={DUMMY_CONFIG}>
        <span data-testid="child">hi</span>
      </WalletConnectProvider>,
    )

    // The provider returns Context.Provider directly; the rendered DOM
    // should be the child <span> at the top of the container.
    expect(container.firstElementChild?.tagName).toBe('SPAN')
    expect(container.firstElementChild?.getAttribute('data-testid')).toBe('child')
    expect(container.children).toHaveLength(1)
  })

  it('does not call manager.initialize() — that is useWallet()s job', () => {
    // The Provider is responsible for building and sharing the manager,
    // NOT for kicking off its lifecycle. `initialize()` is what the
    // useWallet() / useWalletContext() consumer calls (it resumes any
    // pending mobile deep-link callback). Pin this so a future change
    // doesn't accidentally start initialize()-ing inside the Provider
    // and double-initialize when a useWallet() consumer mounts under it.
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    render(
      <WalletConnectProvider config={DUMMY_CONFIG}>
        <div data-testid="bare-child" />
      </WalletConnectProvider>,
    )

    expect(fake.manager.initialize).not.toHaveBeenCalled()
  })

  it('destroys the manager on unmount', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const { unmount } = render(
      <WalletConnectProvider config={DUMMY_CONFIG}>
        <div />
      </WalletConnectProvider>,
    )

    expect(fake.destroySpy).not.toHaveBeenCalled()
    unmount()
    expect(fake.destroySpy).toHaveBeenCalledTimes(1)
  })

  it('recreates the manager when the config object identity changes', () => {
    const first = makeFakeManager()
    const second = makeFakeManager()
    mocks.createWalletManager.mockReturnValueOnce(first.manager).mockReturnValueOnce(second.manager)

    function Probe() {
      const m = useWalletContext()
      // Tag the rendered DOM with the manager identity so the test can
      // confirm the swap visually as well as via the spy.
      return <div data-testid="probe" data-manager={m === first.manager ? 'first' : 'second'} />
    }

    function Harness({ config }: { config: WalletManagerConfig }): ReactNode {
      return (
        <WalletConnectProvider config={config}>
          <Probe />
        </WalletConnectProvider>
      )
    }

    const configA: WalletManagerConfig = { wallets: [] }
    const configB: WalletManagerConfig = { wallets: [] }

    const { getByTestId, rerender } = render(<Harness config={configA} />)
    expect(getByTestId('probe').getAttribute('data-manager')).toBe('first')
    expect(mocks.createWalletManager).toHaveBeenCalledTimes(1)

    rerender(<Harness config={configB} />)
    expect(getByTestId('probe').getAttribute('data-manager')).toBe('second')
    expect(mocks.createWalletManager).toHaveBeenCalledTimes(2)

    // The previous manager must be destroyed when the new one takes over.
    expect(first.destroySpy).toHaveBeenCalledTimes(1)
    expect(second.destroySpy).not.toHaveBeenCalled()
  })

  it('does NOT recreate the manager when the config reference is stable across re-renders', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    function Harness({ config, tick }: { config: WalletManagerConfig; tick: number }): ReactNode {
      return (
        <WalletConnectProvider config={config}>
          <div data-testid="tick">{tick}</div>
        </WalletConnectProvider>
      )
    }

    const stableConfig: WalletManagerConfig = { wallets: [] }
    const { getByTestId, rerender } = render(<Harness config={stableConfig} tick={1} />)
    expect(getByTestId('tick').textContent).toBe('1')

    rerender(<Harness config={stableConfig} tick={2} />)
    expect(getByTestId('tick').textContent).toBe('2')

    rerender(<Harness config={stableConfig} tick={3} />)
    expect(getByTestId('tick').textContent).toBe('3')

    expect(mocks.createWalletManager).toHaveBeenCalledTimes(1)
    expect(fake.destroySpy).not.toHaveBeenCalled()
  })
})
