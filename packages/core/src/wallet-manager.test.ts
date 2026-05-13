import bs58 from 'bs58'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { CallbackResult } from './adapters/callback-handler'
import type { DeepLinkAdapter } from './adapters/deep-link-adapter'
import type { StandardWalletAdapter } from './adapters/standard-wallet-adapter'
import type { DiscoveryHandle } from './discovery'
import { WalletConnectionError, WalletNotConnectedError, WalletNotReadyError } from './errors'
import type { PlatformInfo } from './platform/detector'
import type { PendingState } from './session/store'
import { asWalletName } from './wallet-name'
import type { WalletConfig } from './wallets/sorter'

// --- Module mocks ---------------------------------------------------------

const mocks = vi.hoisted(() => ({
  detectPlatform: vi.fn<() => PlatformInfo>(),
  discoverStandardWallets: vi.fn<() => DiscoveryHandle>(),
  createDeepLinkAdapter: vi.fn<() => DeepLinkAdapter>(),
  getPendingState: vi.fn<() => PendingState | null>(),
  saveLastUsedWallet: vi.fn<(walletId: string) => void>(),
  getLastUsedWallet: vi.fn<() => string | null>(() => null),
}))

vi.mock('./platform/detector', () => ({
  detectPlatform: mocks.detectPlatform,
}))

vi.mock('./discovery', () => ({
  discoverStandardWallets: mocks.discoverStandardWallets,
}))

vi.mock('./adapters/deep-link-adapter', () => ({
  createDeepLinkAdapter: mocks.createDeepLinkAdapter,
}))

vi.mock('./session/store', async () => {
  const actual = await vi.importActual<typeof import('./session/store')>('./session/store')
  return {
    ...actual,
    getPendingState: mocks.getPendingState,
    saveLastUsedWallet: mocks.saveLastUsedWallet,
    getLastUsedWallet: mocks.getLastUsedWallet,
  }
})

// Import AFTER vi.mock so the manager picks up the mocked imports.
const { createWalletManager } = await import('./wallet-manager')

// --- Fixtures -------------------------------------------------------------

const PHANTOM: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/phantom',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=phantom',
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

const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '',
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const DESKTOP_PLATFORM: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: true,
  hasOpindexExtension: false,
  strategy: 'extension',
}

const MOBILE_PLATFORM: PlatformInfo = {
  isMobile: true,
  isIOS: true,
  isAndroid: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'deeplink',
}

const NO_WALLET_PLATFORM: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'install-prompt',
}

function makeStandardAdapter(opts: {
  name: string
  connectPublicKey?: string
  signature?: Uint8Array
  connectThrows?: unknown
  signMessageThrows?: unknown
}): StandardWalletAdapter {
  const fakeWallet = { name: opts.name } as unknown as StandardWalletAdapter['wallet']
  return {
    wallet: fakeWallet,
    publicKey: null,
    isConnected: false,
    connect: vi.fn(async () => {
      if (opts.connectThrows) throw opts.connectThrows
      return { publicKey: opts.connectPublicKey ?? 'PHKpubkey' }
    }),
    disconnect: vi.fn(async () => undefined),
    signMessage: vi.fn(async () => {
      if (opts.signMessageThrows) throw opts.signMessageThrows
      return opts.signature ?? new Uint8Array(64).fill(0xab)
    }),
    signIn: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  } as unknown as StandardWalletAdapter
}

function makeDiscoveryHandle(adapters: StandardWalletAdapter[]): DiscoveryHandle {
  return {
    getAdapters: () => adapters,
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
  }
}

function makeDeepLinkAdapter(overrides: Partial<DeepLinkAdapter> = {}): DeepLinkAdapter {
  return {
    publicKey: null,
    isConnected: false,
    isConnecting: false,
    connect: vi.fn(async () => new Promise<{ publicKey: string }>(() => {})),
    resumeFromCallback: vi.fn(() => null),
    disconnect: vi.fn(async () => undefined),
    signMessage: vi.fn(async () => {
      throw new WalletNotReadyError('not implemented')
    }),
    signIn: vi.fn(async () => {
      throw new WalletNotReadyError('not implemented')
    }),
    subscribe: vi.fn(() => () => {}),
    destroy: vi.fn(),
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getPendingState.mockReturnValue(null)
  mocks.getLastUsedWallet.mockReturnValue(null)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// --- Tests ----------------------------------------------------------------

describe('createWalletManager — desktop / extension path', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('connect() uses the StandardWalletAdapter (extension path)', async () => {
    const phantomAdapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK123' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([phantomAdapter]))
    mocks.createDeepLinkAdapter.mockImplementation(() => makeDeepLinkAdapter())

    const onConnected = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM, SOLFLARE], onConnected })

    await manager.connect('phantom')

    expect(phantomAdapter.connect).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith('PK123')
    expect(manager.getState()).toBe('authenticated') // auto-step (requireSignIn=false)
    expect(mocks.saveLastUsedWallet).toHaveBeenCalledWith('phantom')
  })

  it('onConnected fires after successful connect', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const onConnected = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onConnected })

    await manager.connect('phantom')

    expect(onConnected).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith('PK')
  })

  it('onAuthenticated fires after successful sign-in (requireSignIn=true)', async () => {
    const sig = new Uint8Array(64).fill(0x11)
    const adapter = makeStandardAdapter({
      name: 'Phantom',
      connectPublicKey: 'PK',
      signature: sig,
    })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const onConnected = vi.fn()
    const onAuthenticated = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      signInMessage: (pk) => `Sign in as ${pk}`,
      onConnected,
      onAuthenticated,
    })

    await manager.connect('phantom')

    expect(adapter.signMessage).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith('PK')
    expect(onAuthenticated).toHaveBeenCalledWith('PK', bs58.encode(sig))
    expect(manager.getState()).toBe('authenticated')
  })

  it('onError fires on connect rejection (user cancel)', async () => {
    const adapter = makeStandardAdapter({
      name: 'Phantom',
      connectThrows: new WalletConnectionError('user rejected'),
    })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const onError = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onError })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletConnectionError)

    expect(onError).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('error')
  })

  it('throws when the requested wallet id is not in the config', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await expect(manager.connect('solflare')).rejects.toThrow(/not registered/)
  })

  it('throws when the wallet is in the config but not in the Wallet Standard registry', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletNotReadyError)
  })
})

describe('createWalletManager — mobile / deep-link path', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
  })

  it('connect() uses the DeepLinkAdapter (mobile path)', async () => {
    const dlAdapter = makeDeepLinkAdapter()
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))

    const manager = createWalletManager({ wallets: [PHANTOM] })

    // Don't await — the promise never resolves on this page load.
    void manager.connect('phantom')
    await Promise.resolve()

    expect(dlAdapter.connect).toHaveBeenCalledOnce()
    const callArg = (dlAdapter.connect as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArg).toEqual({ wallet: PHANTOM, requireSignIn: false })
  })

  it('initialize() detects and resumes a pending callback on mobile', () => {
    const resumeResult: CallbackResult = { publicKey: 'PK_FROM_CALLBACK', session: 'sess' }
    const dlAdapter = makeDeepLinkAdapter({
      resumeFromCallback: vi.fn(() => resumeResult),
    })
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    mocks.getPendingState.mockReturnValue({
      walletId: 'phantom',
      requireSignIn: false,
      timestamp: Date.now(),
      ephemeralPublicKey: 'pub',
      ephemeralSecretKey: 'sec',
    })

    const onConnected = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onConnected })
    manager.initialize()

    expect(dlAdapter.resumeFromCallback).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith('PK_FROM_CALLBACK')
    expect(manager.getState()).toBe('authenticated') // requireSignIn=false → auto-step
  })

  it('initialize() resumes with signature when sign-and-connect bundled', () => {
    const resumeResult: CallbackResult = {
      publicKey: 'PK',
      session: 'sess',
      signature: 'sig-b58',
    }
    const dlAdapter = makeDeepLinkAdapter({
      resumeFromCallback: vi.fn(() => resumeResult),
    })
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    mocks.getPendingState.mockReturnValue({
      walletId: 'phantom',
      requireSignIn: true,
      timestamp: Date.now(),
      ephemeralPublicKey: 'pub',
      ephemeralSecretKey: 'sec',
      signInMessage: 'Sign in',
    })

    const onAuthenticated = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      onAuthenticated,
    })
    manager.initialize()

    expect(onAuthenticated).toHaveBeenCalledWith('PK', 'sig-b58')
    expect(manager.getState()).toBe('authenticated')
  })

  it('initialize() does nothing on a normal page load (no pending state)', () => {
    const dlAdapter = makeDeepLinkAdapter()
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    mocks.getPendingState.mockReturnValue(null)

    const onConnected = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onConnected })
    manager.initialize()

    expect(dlAdapter.resumeFromCallback).not.toHaveBeenCalled()
    expect(onConnected).not.toHaveBeenCalled()
    expect(manager.getState()).toBe('idle')
  })

  it('initialize() is a no-op when resumeFromCallback returns null (decryption failed, etc.)', () => {
    const dlAdapter = makeDeepLinkAdapter({ resumeFromCallback: vi.fn(() => null) })
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    mocks.getPendingState.mockReturnValue({
      walletId: 'phantom',
      requireSignIn: false,
      timestamp: Date.now(),
      ephemeralPublicKey: 'pub',
      ephemeralSecretKey: 'sec',
    })
    const onConnected = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onConnected })

    manager.initialize()

    expect(onConnected).not.toHaveBeenCalled()
    expect(manager.getState()).toBe('idle')
  })
})

describe('createWalletManager — wallet ordering', () => {
  it('getSortedWallets() pins Opindex on mobile by default', () => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    mocks.createDeepLinkAdapter.mockReturnValue(makeDeepLinkAdapter())
    const manager = createWalletManager({ wallets: [PHANTOM, SOLFLARE, OPINDEX] })

    const sorted = manager.getSortedWallets()

    expect(sorted[0]?.id).toBe('opindex')
  })

  it('pinnedWallet: null disables Opindex pinning', () => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    mocks.createDeepLinkAdapter.mockReturnValue(makeDeepLinkAdapter())
    const manager = createWalletManager({
      wallets: [PHANTOM, SOLFLARE, OPINDEX],
      pinnedWallet: null,
    })

    const sorted = manager.getSortedWallets()

    // No Opindex pin — falls through to priority sort.
    expect(sorted[0]?.id).not.toBe('opindex')
    expect(sorted[0]?.id).toBe('phantom') // lowest priority
  })
})

describe('createWalletManager — flow state observability', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('getState() reflects the current FlowMachine state', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    expect(manager.getState()).toBe('idle')
    await manager.connect('phantom')
    expect(manager.getState()).toBe('authenticated')
  })

  it('subscribe() notifies on state changes; unsubscribe stops further calls', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    const listener = vi.fn()
    const unsubscribe = manager.subscribe(listener)

    await manager.connect('phantom')
    const callCount = listener.mock.calls.length
    expect(callCount).toBeGreaterThan(0)

    unsubscribe()
    await manager.disconnect()

    expect(listener.mock.calls.length).toBe(callCount) // no further calls after unsubscribe
  })

  it('onStateChange fires on every transition', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const onStateChange = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onStateChange })

    await manager.connect('phantom')

    // connecting → connected → authenticated (auto-step since requireSignIn=false)
    expect(onStateChange).toHaveBeenCalledWith('connecting')
    expect(onStateChange).toHaveBeenCalledWith('connected')
    expect(onStateChange).toHaveBeenCalledWith('authenticated')
  })
})

describe('createWalletManager — install-prompt strategy', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(NO_WALLET_PLATFORM)
  })

  it('connect() throws WalletNotReadyError when no wallet is detected', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const onError = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onError })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletNotReadyError)
    expect(onError).toHaveBeenCalledOnce()
  })
})

describe('createWalletManager — mobile path edge cases', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
  })

  it('connect() reports an error when the deep-link adapter throws', async () => {
    const dlAdapter = makeDeepLinkAdapter({
      connect: vi.fn(async () => {
        throw new WalletConnectionError('cant navigate')
      }),
    })
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    const onError = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onError })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletConnectionError)
    expect(onError).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('error')
  })

  it('connect() passes signInMessage when requireSignIn is true on mobile', async () => {
    const dlAdapter = makeDeepLinkAdapter()
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      signInMessage: () => 'SIWS body without address',
    })

    void manager.connect('phantom')
    await Promise.resolve()

    const callArg = (dlAdapter.connect as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]
    expect(callArg.requireSignIn).toBe(true)
    expect(callArg.signInMessage).toBe('SIWS body without address')
  })

  it('disconnect() delegates to the deep-link adapter and resets the flow', async () => {
    const dlAdapter = makeDeepLinkAdapter()
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await manager.disconnect()

    expect(dlAdapter.disconnect).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('idle')
  })
})

describe('createWalletManager — desktop disconnect path', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('disconnect() delegates to the standard adapter after a successful connect', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await manager.connect('phantom')
    await manager.disconnect()

    expect(adapter.disconnect).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('idle')
  })

  it('disconnect() resets the flow even when there is no current walletId', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await manager.disconnect()

    expect(manager.getState()).toBe('idle')
  })

  it('disconnect() swallows adapter errors and still resets the flow', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    ;(adapter.disconnect as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      throw new Error('disconnect failed')
    })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })
    await manager.connect('phantom')

    await expect(manager.disconnect()).resolves.toBeUndefined()
    expect(manager.getState()).toBe('idle')
  })

  it('signMessage rejection during the SIWS step reports an error', async () => {
    const adapter = makeStandardAdapter({
      name: 'Phantom',
      connectPublicKey: 'PK',
      signMessageThrows: new Error('sign rejected'),
    })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      signInMessage: (pk) => `sign as ${pk}`,
      onError,
    })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletConnectionError)
    expect(onError).toHaveBeenCalledOnce()
    expect(manager.getState()).toBe('error')
  })

  it('getContext() reflects the FlowMachine context (publicKey, signature)', async () => {
    const adapter = makeStandardAdapter({
      name: 'Phantom',
      connectPublicKey: 'PUBLICKEY',
      signature: new Uint8Array(64).fill(0x33),
    })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      signInMessage: () => 'sign',
    })

    await manager.connect('phantom')
    const ctx = manager.getContext()

    expect(ctx.publicKey).toBe('PUBLICKEY')
    expect(ctx.signature).toBe(bs58.encode(new Uint8Array(64).fill(0x33)))
  })
})

describe('createWalletManager — adapter matching by standardName', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('matches a wallet by its standardName when present', async () => {
    const phantomWithStandardName: WalletConfig = {
      ...PHANTOM,
      standardName: asWalletName('Phantom Wallet'),
    }
    const adapter = makeStandardAdapter({
      name: 'Phantom Wallet',
      connectPublicKey: 'STD_PK',
    })
    // Add a near-name decoy that should NOT match (different name).
    const decoy = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'WRONG_PK' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([decoy, adapter]))

    const manager = createWalletManager({ wallets: [phantomWithStandardName] })
    await manager.connect('phantom')

    expect(adapter.connect).toHaveBeenCalledOnce()
    expect(decoy.connect).not.toHaveBeenCalled()
    expect(manager.getContext().publicKey).toBe('STD_PK')
  })
})

describe('createWalletManager — degenerate mobile setup', () => {
  it('connect() throws WalletNotReadyError when the deep-link adapter could not be created', async () => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    mocks.createDeepLinkAdapter.mockReturnValue(null as unknown as DeepLinkAdapter)
    const onError = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onError })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletNotReadyError)
    expect(onError).toHaveBeenCalledOnce()
  })

  it('connect() returns cleanly when the deep-link adapter resolves (test stub path)', async () => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    // Most production code never resolves on this page load; this test
    // exercises the post-await branch by making the adapter's connect()
    // resolve, which mimics what the next page load WOULD return after
    // the redirect round-trip.
    const dlAdapter = makeDeepLinkAdapter({
      connect: vi.fn(async () => ({ publicKey: 'PK' })),
    })
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await expect(manager.connect('phantom')).resolves.toBeUndefined()
  })
})

describe('createWalletManager — retry semantics', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('connect() succeeds on retry after a failed prior attempt (auto-RESET from error)', async () => {
    let attempt = 0
    const adapter: StandardWalletAdapter = {
      wallet: { name: 'Phantom' } as unknown as StandardWalletAdapter['wallet'],
      publicKey: null,
      isConnected: false,
      connect: vi.fn(async () => {
        attempt++
        if (attempt === 1) throw new WalletConnectionError('user cancelled')
        return { publicKey: 'PK_SECOND_ATTEMPT' }
      }),
      disconnect: vi.fn(async () => undefined),
      signMessage: vi.fn(),
      signIn: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      destroy: vi.fn(),
    } as unknown as StandardWalletAdapter
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await expect(manager.connect('phantom')).rejects.toThrow(WalletConnectionError)
    expect(manager.getState()).toBe('error')

    // Retry — should NOT throw "Invalid transition"; auto-RESET kicks in.
    await manager.connect('phantom')

    expect(manager.getState()).toBe('authenticated')
    expect(manager.getContext().publicKey).toBe('PK_SECOND_ATTEMPT')
  })

  it('connect() with a different wallet works after a prior successful authenticate', async () => {
    const adapterA = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK_A' })
    const adapterB = makeStandardAdapter({ name: 'Solflare', connectPublicKey: 'PK_B' })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapterA, adapterB]))
    const manager = createWalletManager({ wallets: [PHANTOM, SOLFLARE] })

    await manager.connect('phantom')
    expect(manager.getState()).toBe('authenticated')
    expect(manager.getContext().publicKey).toBe('PK_A')

    // Switch to Solflare without an explicit disconnect.
    await manager.connect('solflare')

    expect(manager.getState()).toBe('authenticated')
    expect(manager.getContext().publicKey).toBe('PK_B')
  })

  it('concurrent connect() calls share one in-flight promise (single-flight)', async () => {
    type Resolver = (result: { publicKey: string }) => void
    const deferred: { resolve: Resolver | null } = { resolve: null }
    const slowAdapter: StandardWalletAdapter = {
      wallet: { name: 'Phantom' } as unknown as StandardWalletAdapter['wallet'],
      publicKey: null,
      isConnected: false,
      connect: vi.fn(
        () =>
          new Promise<{ publicKey: string }>((res) => {
            deferred.resolve = res
          }),
      ),
      disconnect: vi.fn(async () => undefined),
      signMessage: vi.fn(),
      signIn: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      destroy: vi.fn(),
    } as unknown as StandardWalletAdapter
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([slowAdapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    const p1 = manager.connect('phantom')
    const p2 = manager.connect('phantom')

    // Yield once so the inner adapter.connect promise is set up.
    await Promise.resolve()
    deferred.resolve?.({ publicKey: 'PK' })
    await Promise.all([p1, p2])

    expect((slowAdapter.connect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1)
    expect(manager.getState()).toBe('authenticated')
  })

  it('rejects connect() for a different wallet while another connect is in flight', async () => {
    type Resolver = (result: { publicKey: string }) => void
    const deferred: { resolve: Resolver | null } = { resolve: null }
    const phantomAdapter: StandardWalletAdapter = {
      wallet: { name: 'Phantom' } as unknown as StandardWalletAdapter['wallet'],
      publicKey: null,
      isConnected: false,
      connect: vi.fn(
        () =>
          new Promise<{ publicKey: string }>((res) => {
            deferred.resolve = res
          }),
      ),
      disconnect: vi.fn(async () => undefined),
      signMessage: vi.fn(),
      signIn: vi.fn(),
      subscribe: vi.fn(() => () => {}),
      destroy: vi.fn(),
    } as unknown as StandardWalletAdapter
    const solflareAdapter: StandardWalletAdapter = {
      ...phantomAdapter,
      wallet: { name: 'Solflare' } as unknown as StandardWalletAdapter['wallet'],
      connect: vi.fn(async () => ({ publicKey: 'PK_SOLFLARE' })),
    } as unknown as StandardWalletAdapter
    mocks.discoverStandardWallets.mockReturnValue(
      makeDiscoveryHandle([phantomAdapter, solflareAdapter]),
    )
    const manager = createWalletManager({ wallets: [PHANTOM, SOLFLARE] })

    const p1 = manager.connect('phantom')
    await Promise.resolve()
    // Different walletId while phantom is in flight: reject loudly rather
    // than silently returning the phantom promise.
    await expect(manager.connect('solflare')).rejects.toThrow(/in flight/i)
    expect((solflareAdapter.connect as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)

    deferred.resolve?.({ publicKey: 'PK' })
    await p1
    // After phantom settles, solflare can proceed normally.
    await expect(manager.connect('solflare')).resolves.toBeUndefined()
  })
})

describe('createWalletManager — use after destroy', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it.each<['connect' | 'disconnect' | 'initialize' | 'subscribe']>([
    ['connect'],
    ['disconnect'],
    ['initialize'],
    ['subscribe'],
  ])('throws when %s is called after destroy()', async (method) => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })
    manager.destroy()

    if (method === 'connect') {
      await expect(manager.connect('phantom')).rejects.toThrow(/has been destroyed/)
    } else if (method === 'disconnect') {
      await expect(manager.disconnect()).rejects.toThrow(/has been destroyed/)
    } else if (method === 'initialize') {
      expect(() => manager.initialize()).toThrow(/has been destroyed/)
    } else {
      expect(() => manager.subscribe(() => {})).toThrow(/has been destroyed/)
    }
  })

  it('destroy() is idempotent', () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    expect(() => {
      manager.destroy()
      manager.destroy()
    }).not.toThrow()
  })
})

describe('createWalletManager — disconnect on idle is quiet', () => {
  it('does not emit a spurious onStateChange("idle") on a never-connected desktop manager', async () => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const onStateChange = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onStateChange })

    await manager.disconnect()

    expect(onStateChange).not.toHaveBeenCalled()
    expect(manager.getState()).toBe('idle')
  })

  it('does not emit a spurious onStateChange("idle") on a never-connected mobile manager', async () => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    mocks.createDeepLinkAdapter.mockReturnValue(makeDeepLinkAdapter())
    const onStateChange = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onStateChange })

    await manager.disconnect()

    expect(onStateChange).not.toHaveBeenCalled()
  })
})

describe('createWalletManager — callback exception isolation', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('a throwing onConnected does not poison the rest of the connect flow', async () => {
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
      const adapter = makeStandardAdapter({
        name: 'Phantom',
        connectPublicKey: 'PK',
        signature: new Uint8Array(64).fill(0x77),
      })
      mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
      const manager = createWalletManager({
        wallets: [PHANTOM],
        requireSignIn: true,
        signInMessage: () => 'sign',
        onConnected: () => {
          throw new Error('onConnected exploded')
        },
      })

      // Should still complete the auth flow despite the bad callback.
      await manager.connect('phantom')

      expect(manager.getState()).toBe('authenticated')
      expect(manager.getContext().signature).toBe(bs58.encode(new Uint8Array(64).fill(0x77)))
      // The error WAS surfaced asynchronously.
      expect(captured.length).toBe(1)
      expect((captured[0] as Error).message).toBe('onConnected exploded')
    } finally {
      globalThis.queueMicrotask = original
    }
  })

  it('a throwing onError does not corrupt the rethrown WalletError', async () => {
    const original = globalThis.queueMicrotask
    globalThis.queueMicrotask = (fn) => {
      try {
        fn()
      } catch {
        // swallow
      }
    }
    try {
      const adapter = makeStandardAdapter({
        name: 'Phantom',
        connectThrows: new WalletConnectionError('user rejected'),
      })
      mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
      const manager = createWalletManager({
        wallets: [PHANTOM],
        onError: () => {
          throw new Error('onError exploded')
        },
      })

      // The rejection should be the ORIGINAL WalletConnectionError, not the
      // onError-thrown garbage. Without safeCallback wrapping, the onError
      // throw would replace the rethrow.
      await expect(manager.connect('phantom')).rejects.toThrow(WalletConnectionError)
    } finally {
      globalThis.queueMicrotask = original
    }
  })
})

describe('createWalletManager — destroy', () => {
  it('destroys discovery on desktop', () => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
    const handle = makeDiscoveryHandle([])
    mocks.discoverStandardWallets.mockReturnValue(handle)

    const manager = createWalletManager({ wallets: [PHANTOM] })
    manager.destroy()

    expect(handle.destroy).toHaveBeenCalledOnce()
  })

  it('destroys the deep-link adapter on mobile', () => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    const dlAdapter = makeDeepLinkAdapter()
    mocks.createDeepLinkAdapter.mockReturnValue(dlAdapter)

    const manager = createWalletManager({ wallets: [PHANTOM] })
    manager.destroy()

    expect(dlAdapter.destroy).toHaveBeenCalledOnce()
  })
})

describe('createWalletManager — signMessage / signIn (desktop)', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(DESKTOP_PLATFORM)
  })

  it('signMessage delegates to the connected StandardWalletAdapter', async () => {
    const sig = new Uint8Array(64).fill(0x42)
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK', signature: sig })
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await manager.connect('phantom')
    const message = new TextEncoder().encode('hello')
    const out = await manager.signMessage(new Uint8Array(message))

    expect(adapter.signMessage).toHaveBeenCalledWith(expect.any(Uint8Array))
    expect(out).toEqual(sig)
  })

  it('signIn delegates to the connected StandardWalletAdapter', async () => {
    const adapter = makeStandardAdapter({ name: 'Phantom', connectPublicKey: 'PK' })
    const signInResult = {
      account: { address: 'PK' },
      signedMessage: new Uint8Array([1]),
      signature: new Uint8Array([2]),
    }
    ;(adapter.signIn as ReturnType<typeof vi.fn>).mockResolvedValue(signInResult)
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([adapter]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await manager.connect('phantom')
    const out = await manager.signIn({ domain: 'example.com' })

    expect(adapter.signIn).toHaveBeenCalledWith({ domain: 'example.com' })
    expect(out).toBe(signInResult)
  })

  it('signMessage throws WalletNotConnectedError when no wallet is connected', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await expect(manager.signMessage(new Uint8Array([0]))).rejects.toThrow(WalletNotConnectedError)
  })

  it('signIn throws WalletNotConnectedError when no wallet is connected', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })

    await expect(manager.signIn()).rejects.toThrow(WalletNotConnectedError)
  })

  it('signMessage throws after destroy()', async () => {
    mocks.discoverStandardWallets.mockReturnValue(makeDiscoveryHandle([]))
    const manager = createWalletManager({ wallets: [PHANTOM] })
    manager.destroy()

    await expect(manager.signMessage(new Uint8Array([0]))).rejects.toThrow(/has been destroyed/)
  })
})

describe('createWalletManager — signMessage / signIn (mobile)', () => {
  beforeEach(() => {
    mocks.detectPlatform.mockReturnValue(MOBILE_PLATFORM)
    mocks.createDeepLinkAdapter.mockReturnValue(makeDeepLinkAdapter())
  })

  it('signMessage throws WalletNotReadyError — bundled SIWS only on the deep-link path', async () => {
    const manager = createWalletManager({ wallets: [PHANTOM] })
    await expect(manager.signMessage(new Uint8Array([0]))).rejects.toThrow(WalletNotReadyError)
  })

  it('signIn throws WalletNotReadyError — bundled SIWS only on the deep-link path', async () => {
    const manager = createWalletManager({ wallets: [PHANTOM] })
    await expect(manager.signIn()).rejects.toThrow(WalletNotReadyError)
  })
})
