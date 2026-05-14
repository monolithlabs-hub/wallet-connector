import {
  createFlowMachine,
  WalletConnectionError,
  type FlowMachine,
  type PlatformInfo,
  type WalletListEntry,
  type WalletManager,
} from '@monolithlabs/wallet-connect-core'
import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'

import { WalletConnectInjectionKey } from '../context/injection-key'
import { useWalletContext } from '../context/use-wallet-context'

import { useWallet, type UseWalletReturn } from './use-wallet'

// --- Fixtures ------------------------------------------------------------

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

// --- Mock manager --------------------------------------------------------

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
  setPlatform: (next: PlatformInfo) => void
  notifyRegistryChange: () => void
}

function makeMockManager(wallets: WalletListEntry[] = [PHANTOM, SOLFLARE]): MockManager {
  const machine = createFlowMachine()
  const initializeSpy = vi.fn()
  const connectSpy = vi.fn(async (walletId: string) => {
    machine.send({ type: 'CONNECT_INITIATED', walletId })
  })
  const disconnectSpy = vi.fn(async () => {
    machine.send({ type: 'RESET' })
  })
  const signMessageSpy = vi.fn(async () => new Uint8Array([1, 2, 3]))
  const signInSpy = vi.fn()
  const unsubscribeSpy = vi.fn()

  let platform: PlatformInfo = DEFAULT_PLATFORM
  let version = 0
  const listeners = new Set<(state: ReturnType<FlowMachine['getState']>) => void>()
  function notify() {
    version += 1
    const state = machine.getState()
    for (const listener of [...listeners]) listener(state)
  }
  machine.subscribe(() => notify())

  const manager: WalletManager = {
    initialize: initializeSpy,
    connect: connectSpy,
    disconnect: disconnectSpy,
    signMessage: signMessageSpy,
    signIn: signInSpy,
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    getSortedWallets: () => wallets,
    getPlatform: () => platform,
    getVersion: () => version,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        unsubscribeSpy()
        listeners.delete(listener)
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
    setPlatform: (next) => {
      platform = next
    },
    notifyRegistryChange: () => notify(),
  }
}

/**
 * Mount a host component whose setup captures the composable's return so
 * tests can drive it via `wrapper.vm.wallet`. The host renders a small
 * template that reflects state into the DOM — handy for reactivity
 * assertions.
 */
function mountWithManager(manager: WalletManager) {
  let captured!: UseWalletReturn
  const Host = defineComponent({
    name: 'UseWalletHost',
    setup() {
      const wallet = useWallet()
      captured = wallet
      return () =>
        h('div', { 'data-testid': 'host' }, [
          h('span', { 'data-testid': 'state' }, wallet.state.value),
          h('span', { 'data-testid': 'pubkey' }, wallet.publicKey.value ?? 'null'),
          h('span', { 'data-testid': 'is-connected' }, String(wallet.isConnected.value)),
        ])
    },
  })

  const wrapper = mount(Host, {
    global: {
      provide: {
        [WalletConnectInjectionKey as symbol]: manager,
      },
    },
  })
  return {
    wrapper,
    get wallet() {
      return captured
    },
  }
}

beforeEach(() => {
  vi.useRealTimers()
})

afterEach(() => {
  vi.clearAllMocks()
})

// --- Tests ---------------------------------------------------------------

describe('useWallet (Vue composable)', () => {
  it('returns idle state on mount', () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    expect(wallet.state.value).toBe('idle')
    expect(wallet.isConnecting.value).toBe(false)
    expect(wallet.isConnected.value).toBe(false)
    expect(wallet.isAuthenticated.value).toBe(false)
    expect(wallet.publicKey.value).toBeNull()
    expect(wallet.error.value).toBeNull()
  })

  it('calls manager.initialize() onMounted', () => {
    const mock = makeMockManager()
    mountWithManager(mock.manager)

    expect(mock.initializeSpy).toHaveBeenCalledTimes(1)
  })

  it('reactive state updates trigger template re-render', async () => {
    const mock = makeMockManager()
    const { wrapper, wallet } = mountWithManager(mock.manager)

    expect(wrapper.get('[data-testid="state"]').text()).toBe('idle')

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    await nextTick()

    expect(wallet.state.value).toBe('connecting')
    expect(wrapper.get('[data-testid="state"]').text()).toBe('connecting')
  })

  it('connect(walletId) calls manager.connect with the walletId', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    await wallet.connect('phantom')

    expect(mock.connectSpy).toHaveBeenCalledTimes(1)
    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('connect() uses the prior select() in the same handler', async () => {
    // Vue refs update synchronously, so a `select(); connect()` pair in
    // a single event handler reads the just-written selection from the
    // ref without any read-after-write workaround. This test pins that
    // assumption — if Vue ever changes ref-setter semantics, this
    // catches it.
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    wallet.select('phantom')
    await wallet.connect()

    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('connect() throws when no wallet has been selected', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    await expect(wallet.connect()).rejects.toThrow(WalletConnectionError)
    expect(mock.connectSpy).not.toHaveBeenCalled()
  })

  it('isConnected computed becomes true after the flow reaches `connected`', async () => {
    const mock = makeMockManager()
    const { wrapper, wallet } = mountWithManager(mock.manager)

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK_FROM_WALLET',
      requireSignIn: false,
    })
    await nextTick()

    expect(wallet.isConnected.value).toBe(true)
    expect(wallet.isAuthenticated.value).toBe(true)
    expect(wallet.publicKey.value).toBe('PK_FROM_WALLET')
    expect(wrapper.get('[data-testid="is-connected"]').text()).toBe('true')
  })

  it('exposes the SIWS signature on the authenticated transition', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK',
      requireSignIn: true,
    })
    mock.machine.send({ type: 'SIGN_INITIATED' })
    mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    await nextTick()

    expect(wallet.isAuthenticated.value).toBe(true)
    expect(wallet.signature.value).toBe('sig-b58')
  })

  it('subscription is cleaned up on unmount', () => {
    const mock = makeMockManager()
    const { wrapper } = mountWithManager(mock.manager)

    expect(mock.unsubscribeSpy).not.toHaveBeenCalled()
    wrapper.unmount()
    expect(mock.unsubscribeSpy).toHaveBeenCalledTimes(1)
  })

  it('error becomes reactive after an ERROR event', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    const err = new WalletConnectionError('user rejected')
    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({ type: 'ERROR', error: err })
    await nextTick()

    expect(wallet.state.value).toBe('error')
    expect(wallet.error.value).toBe(err)
  })

  it('select() exposes the chosen wallet via the `wallet` computed pre-connect', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    expect(wallet.wallet.value).toBeNull()

    wallet.select('solflare')
    await nextTick()

    expect(wallet.wallet.value?.id).toBe('solflare')
  })

  it('disconnect toggles the disconnecting ref around the manager call', async () => {
    const mock = makeMockManager()
    let resolveDisconnect: () => void = () => {}
    mock.disconnectSpy.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDisconnect = resolve
        }),
    )
    const { wallet } = mountWithManager(mock.manager)

    expect(wallet.disconnecting.value).toBe(false)

    const pending = wallet.disconnect()
    expect(wallet.disconnecting.value).toBe(true)

    resolveDisconnect()
    await pending
    expect(wallet.disconnecting.value).toBe(false)
  })

  it('signMessage and signIn delegate to the manager', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)
    const message = new Uint8Array([9, 8, 7])

    await wallet.signMessage(message)
    expect(mock.signMessageSpy).toHaveBeenCalledWith(message)

    await wallet.signIn({ domain: 'example.com' })
    expect(mock.signInSpy).toHaveBeenCalledWith({ domain: 'example.com' })
  })

  it('exposes platform from the manager', () => {
    const mock = makeMockManager()
    mock.setPlatform({ ...DEFAULT_PLATFORM, hasOpindexExtension: true })
    const { wallet } = mountWithManager(mock.manager)

    expect(wallet.platform.value.hasOpindexExtension).toBe(true)
  })

  it('platform updates when the manager fires a registry-only notification', async () => {
    const mock = makeMockManager()
    const { wallet } = mountWithManager(mock.manager)

    expect(wallet.platform.value.hasOpindexExtension).toBe(false)

    mock.setPlatform({ ...DEFAULT_PLATFORM, hasOpindexExtension: true })
    mock.notifyRegistryChange()
    await nextTick()

    expect(wallet.platform.value.hasOpindexExtension).toBe(true)
  })

  it('throws when useWalletContext is called outside of setup()', () => {
    // No Vue component context — getCurrentInstance() returns null.
    expect(() => useWalletContext()).toThrow(/must be called from a component setup\(\) function/)
  })

  it('throws a descriptive error when used without the Plugin', () => {
    const errSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      // Mount a host that calls useWallet WITHOUT injecting a manager.
      // The composable's useWalletContext() should throw at setup time.
      const Host = defineComponent({
        setup() {
          useWallet()
          return () => h('div')
        },
      })
      expect(() => mount(Host)).toThrow(
        /must be used inside an app that installs WalletConnectPlugin/,
      )
    } finally {
      errSpy.mockRestore()
    }
  })
})
