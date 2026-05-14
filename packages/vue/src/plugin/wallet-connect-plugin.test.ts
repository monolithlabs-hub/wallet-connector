import {
  createFlowMachine,
  type FlowMachine,
  type WalletManager,
  type WalletManagerConfig,
} from '@monolithlabs-hub/wallet-connect-core'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, type App } from 'vue'

import { useWallet } from '../composables/use-wallet'
import { useWalletContext } from '../context/use-wallet-context'

import { WalletConnectPlugin } from './wallet-connect-plugin'

// --- Module mock ---------------------------------------------------------

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
    getPlatform: () => ({
      isMobile: false,
      isIOS: false,
      isAndroid: false,
      hasExtension: false,
      hasOpindexExtension: false,
      strategy: 'install-prompt',
    }),
    getVersion: () => 0,
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

describe('WalletConnectPlugin', () => {
  it('installs without errors', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const app = createApp({ render: () => null })
    expect(() => app.use(WalletConnectPlugin, DUMMY_CONFIG)).not.toThrow()
  })

  it('builds the manager from the config passed to install()', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const app = createApp({ render: () => null })
    app.use(WalletConnectPlugin, DUMMY_CONFIG)

    expect(mocks.createWalletManager).toHaveBeenCalledTimes(1)
    expect(mocks.createWalletManager).toHaveBeenCalledWith(DUMMY_CONFIG)
  })

  it('creates a single manager regardless of how many consumers call useWallet()', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    function Consumer() {
      return defineComponent({
        setup() {
          // Trigger the inject path — verifies the consumer can pick up
          // the provided manager.
          useWallet()
          return () => h('div')
        },
      })
    }

    const Host = defineComponent({
      components: {
        ConsumerA: Consumer(),
        ConsumerB: Consumer(),
        ConsumerC: Consumer(),
      },
      template: '<div><ConsumerA /><ConsumerB /><ConsumerC /></div>',
    })

    mount(Host, {
      global: {
        plugins: [[WalletConnectPlugin, DUMMY_CONFIG]],
      },
    })

    expect(mocks.createWalletManager).toHaveBeenCalledTimes(1)
  })

  it('useWallet() reads the manager that the plugin provided', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    const Host = defineComponent({
      setup() {
        const wallet = useWallet()
        return { wallet }
      },
      template: '<div>{{ wallet.state }}</div>',
    })

    mount(Host, {
      global: {
        plugins: [[WalletConnectPlugin, DUMMY_CONFIG]],
      },
    })

    // initialize() is called on mount by useWallet — observable signal
    // that the plugin-provided manager is the one useWallet picked up.
    expect(fake.manager.initialize).toHaveBeenCalledTimes(1)
  })

  it('useWalletContext() reads the manager that the plugin provided', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    let captured: WalletManager | null = null
    const Host = defineComponent({
      setup() {
        captured = useWalletContext()
        return () => h('div')
      },
    })

    mount(Host, {
      global: {
        plugins: [[WalletConnectPlugin, DUMMY_CONFIG]],
      },
    })

    expect(captured).toBe(fake.manager)
  })

  it('is a no-op when installed twice on the same app — Vue dedups installs', () => {
    // Pins Vue's per-app plugin dedup behavior. If Vue ever drops it, we
    // need to know — the JSDoc on this plugin currently makes promises
    // about idempotency that only hold while Vue's `app.use` dedups.
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    try {
      const otherConfig: WalletManagerConfig = { wallets: [] }
      const app = createApp({ render: () => null })
      app.use(WalletConnectPlugin, DUMMY_CONFIG)
      app.use(WalletConnectPlugin, otherConfig)

      // Install ran once with the first config; the second call's config
      // is silently ignored.
      expect(mocks.createWalletManager).toHaveBeenCalledTimes(1)
      expect(mocks.createWalletManager).toHaveBeenCalledWith(DUMMY_CONFIG)
    } finally {
      warnSpy.mockRestore()
    }
  })

  it('destroys the manager on app.unmount()', () => {
    const fake = makeFakeManager()
    mocks.createWalletManager.mockReturnValue(fake.manager)

    // Use createApp directly instead of mount() — @vue/test-utils
    // wrappers may not surface the underlying app.onUnmount lifecycle
    // cleanly, but a direct createApp + mount + unmount cycle does.
    const container = document.createElement('div')
    const app: App = createApp({ render: () => null })
    app.use(WalletConnectPlugin, DUMMY_CONFIG)
    app.mount(container)

    expect(fake.destroySpy).not.toHaveBeenCalled()
    app.unmount()
    expect(fake.destroySpy).toHaveBeenCalledTimes(1)
  })
})
