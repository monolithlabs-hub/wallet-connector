import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { WalletConnectionError, WalletNotReadyError } from '../errors'
import {
  clearPendingState,
  getLastUsedWallet,
  getPendingState,
  saveLastUsedWallet,
} from '../session/store'
import type { WalletConfig } from '../wallets/sorter'

import { createDeepLinkAdapter } from './deep-link-adapter'

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'

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

const OPINDEX: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '',
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: 'https://apps.apple.com/app/opindex',
  playStoreUrl: 'https://play.google.com/store/apps/details?id=opindex',
}

function baseOptions(overrides: Partial<Parameters<typeof createDeepLinkAdapter>[0]> = {}) {
  return {
    appUrl: 'https://dapp.example.com',
    redirectUrl: 'https://dapp.example.com/cb',
    cluster: 'mainnet-beta' as const,
    navigate: vi.fn<(url: string) => void>(),
    ...overrides,
  }
}

/** Encrypt a payload the way Phantom would, then build the callback URL. */
function makeCallbackUrl(opts: {
  baseUrl: string
  payload: Record<string, unknown>
  dappPublicKey: Uint8Array
}): string {
  const walletKeypair = nacl.box.keyPair()
  const nonce = nacl.randomBytes(24)
  const shared = nacl.box.before(opts.dappPublicKey, walletKeypair.secretKey)
  const plaintext = new Uint8Array(new TextEncoder().encode(JSON.stringify(opts.payload)))
  const cipher = nacl.box.after(plaintext, nonce, shared)

  const url = new URL(opts.baseUrl)
  url.searchParams.set('phantom_encryption_public_key', bs58.encode(walletKeypair.publicKey))
  url.searchParams.set('nonce', bs58.encode(nonce))
  url.searchParams.set('data', bs58.encode(cipher))
  return url.toString()
}

const FAKE_PUBKEY = 'B1bQrkRoy3oUL7fXJBQVDqkqu6Yk2HFwoejPpc4mtBnY'
const FAKE_SESSION = 'session-token-abc'

const realLocation = window.location
const realHistory = window.history

beforeEach(() => {
  clearPendingState()
  sessionStorage.clear()
  localStorage.clear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(window, 'location', { value: realLocation, configurable: true })
  Object.defineProperty(window, 'history', { value: realHistory, configurable: true })
  realHistory.replaceState({}, '', '/')
})

describe('DeepLinkAdapter.connect', () => {
  it('saves pending state to sessionStorage before navigating', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    void adapter.connect({ wallet: PHANTOM })

    const pending = getPendingState()
    expect(pending).not.toBeNull()
    expect(pending?.walletId).toBe('phantom')
    expect(pending?.requireSignIn).toBe(false)
    expect(pending?.ephemeralPublicKey.length).toBeGreaterThan(0)
    expect(pending?.ephemeralSecretKey.length).toBeGreaterThan(0)
    // Navigation happened (we captured it; jsdom didn't actually navigate).
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('navigates to a Phantom Universal Link URL with correct query params', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    void adapter.connect({ wallet: PHANTOM })

    const url = navigate.mock.calls[0]?.[0] ?? ''
    expect(url.startsWith('https://phantom.app/ul/v1/connect?')).toBe(true)
    const params = new URL(url).searchParams
    expect(params.get('cluster')).toBe('mainnet-beta')
    expect(params.get('app_url')).toBe('https://dapp.example.com')
    expect(params.get('redirect_link')).toBe('https://dapp.example.com/cb')
    expect(params.get('dapp_encryption_public_key')?.length).toBeGreaterThan(20)
  })

  it('uses buildSignAndConnectUrl when requireSignIn is true and signInMessage is provided', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    void adapter.connect({
      wallet: PHANTOM,
      requireSignIn: true,
      signInMessage: 'Sign in to Opindex',
    })

    const url = navigate.mock.calls[0]?.[0] ?? ''
    const params = new URL(url).searchParams
    expect(params.get('sign_in_message')).toBe('Sign in to Opindex')
  })

  it('rejects synchronously when requireSignIn is true but signInMessage is missing', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    await expect(adapter.connect({ wallet: PHANTOM, requireSignIn: true })).rejects.toThrow(
      WalletConnectionError,
    )
    // No navigation, no pending state.
    expect(navigate).not.toHaveBeenCalled()
    expect(getPendingState()).toBeNull()
  })

  it('does not re-navigate on duplicate concurrent calls (idempotent)', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    void adapter.connect({ wallet: PHANTOM })
    void adapter.connect({ wallet: PHANTOM })

    // The async wrapper Promise differs per call, but the internal inflight
    // shared state means navigate fires once and only one pending state
    // record is written.
    expect(navigate).toHaveBeenCalledOnce()
    expect(getPendingState()).not.toBeNull()
  })

  it('does not retain the rejection from a validation failure for subsequent calls', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    await expect(adapter.connect({ wallet: PHANTOM, requireSignIn: true })).rejects.toThrow()
    // Second attempt with valid input should proceed.
    void adapter.connect({ wallet: PHANTOM })
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('does not persist pending state when buildConnectUrl throws synchronously', async () => {
    const navigate = vi.fn<(url: string) => void>()
    // `javascript:` redirectUrl is rejected by buildConnectUrl's runtime guard.
    const adapter = createDeepLinkAdapter({
      appUrl: 'https://dapp.example.com',
      redirectUrl: 'javascript:alert(1)',
      cluster: 'mainnet-beta',
      navigate,
    })

    await expect(adapter.connect({ wallet: PHANTOM })).rejects.toThrow()

    // BLOCKER-2 fix: state was NOT saved before the URL build, so the
    // sync throw rolls back cleanly.
    expect(getPendingState()).toBeNull()
    // CONCERN-1 fix: isConnecting was never flipped to true.
    expect(adapter.isConnecting).toBe(false)
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('DeepLinkAdapter cross-adapter session safety', () => {
  it("a never-connected adapter's disconnect() does not clear another adapter's pending state", async () => {
    const navigateA = vi.fn<(url: string) => void>()
    const adapterA = createDeepLinkAdapter(baseOptions({ navigate: navigateA }))
    void adapterA.connect({ wallet: PHANTOM })
    expect(getPendingState()).not.toBeNull()

    // Adapter B was never connected; its disconnect must not touch A's state.
    const adapterB = createDeepLinkAdapter(baseOptions({ navigate: vi.fn() }))
    await adapterB.disconnect()

    expect(getPendingState()).not.toBeNull()
    expect(getPendingState()?.walletId).toBe('phantom')
  })

  it("an in-flight adapter's disconnect() DOES clear its own pending state", async () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM })
    expect(getPendingState()).not.toBeNull()
    expect(adapter.isConnecting).toBe(true)

    await adapter.disconnect()

    expect(getPendingState()).toBeNull()
    expect(adapter.isConnecting).toBe(false)
  })
})

describe('DeepLinkAdapter Opindex fallback with missing store URLs', () => {
  it('skips fallback (just navigates) when both store URLs are empty', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    const scheduleFallback = vi.fn(() => () => {})
    const navigate = vi.fn<(url: string) => void>()
    const opindexNoStore: WalletConfig = { ...OPINDEX, appStoreUrl: '', playStoreUrl: '' }
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback, navigate }))

    void adapter.connect({ wallet: opindexNoStore })

    expect(scheduleFallback).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledOnce()
  })
})

describe('DeepLinkAdapter Opindex App Store / Play Store fallback', () => {
  it('schedules the App Store fallback on iOS with the appStoreUrl', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    const scheduleFallback = vi.fn<
      Parameters<typeof createDeepLinkAdapter>[0]['scheduleFallback'] & {}
    >(() => () => {})
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback, navigate }))

    void adapter.connect({ wallet: OPINDEX })

    expect(scheduleFallback).toHaveBeenCalledOnce()
    const callArg = scheduleFallback.mock.calls[0]?.[0]
    expect(callArg?.storeUrl).toBe('https://apps.apple.com/app/opindex')
    expect(callArg?.timeoutMs).toBe(1500)
    expect(callArg?.deepLinkUrl.startsWith('https://opindex.app/ul/v1/connect?')).toBe(true)
    // The scheduler is responsible for the actual navigation — the adapter
    // doesn't call `navigate` directly in this path.
    expect(navigate).not.toHaveBeenCalled()
  })

  it('schedules the Play Store fallback on Android with the playStoreUrl', () => {
    vi.stubGlobal('navigator', { userAgent: ANDROID_UA })
    const scheduleFallback = vi.fn<
      Parameters<typeof createDeepLinkAdapter>[0]['scheduleFallback'] & {}
    >(() => () => {})
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback }))

    void adapter.connect({ wallet: OPINDEX })

    const callArg = scheduleFallback.mock.calls[0]?.[0]
    expect(callArg?.storeUrl).toBe('https://play.google.com/store/apps/details?id=opindex')
  })

  it('does not schedule a fallback for non-Opindex wallets', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    const scheduleFallback = vi.fn(() => () => {})
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback, navigate }))

    void adapter.connect({ wallet: PHANTOM })

    expect(scheduleFallback).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('does not schedule a fallback on desktop (no mobile UA)', () => {
    vi.stubGlobal('navigator', {
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    })
    const scheduleFallback = vi.fn(() => () => {})
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback, navigate }))

    void adapter.connect({ wallet: OPINDEX })

    expect(scheduleFallback).not.toHaveBeenCalled()
    expect(navigate).toHaveBeenCalledOnce()
  })

  it('cancels a pending fallback when resumeFromCallback succeeds', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    const cancel = vi.fn()
    const scheduleFallback = vi.fn(() => cancel)
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback, navigate }))

    void adapter.connect({ wallet: OPINDEX })
    expect(scheduleFallback).toHaveBeenCalled()
    const pending = getPendingState()
    const dappPub = bs58.decode(pending?.ephemeralPublicKey ?? '')

    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: dappPub,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    const result = adapter.resumeFromCallback()

    expect(result?.publicKey).toBe(FAKE_PUBKEY)
    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('DeepLinkAdapter.resumeFromCallback', () => {
  it('resolves with publicKey from the decrypted payload', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM })
    const pending = getPendingState()
    const dappPub = bs58.decode(pending?.ephemeralPublicKey ?? '')
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: dappPub,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    const result = adapter.resumeFromCallback()

    expect(result?.publicKey).toBe(FAKE_PUBKEY)
    expect(result?.session).toBe(FAKE_SESSION)
    expect(adapter.isConnected).toBe(true)
    expect(adapter.publicKey).toBe(FAKE_PUBKEY)
    // Pending state was cleared.
    expect(getPendingState()).toBeNull()
    // Last-used wallet was remembered.
    expect(getLastUsedWallet()).toBe('phantom')
  })

  it('returns a result with signature when sign-and-connect was used', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({
      wallet: PHANTOM,
      requireSignIn: true,
      signInMessage: 'sign in',
    })
    const pending = getPendingState()
    expect(pending?.requireSignIn).toBe(true)
    const dappPub = bs58.decode(pending?.ephemeralPublicKey ?? '')
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION, signature: 'sig-b58' },
      dappPublicKey: dappPub,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    const result = adapter.resumeFromCallback()

    expect(result?.signature).toBe('sig-b58')
  })

  it('resumes with no signature when requireSignIn was false', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM, requireSignIn: false })
    const pending = getPendingState()
    expect(pending?.requireSignIn).toBe(false)
    const dappPub = bs58.decode(pending?.ephemeralPublicKey ?? '')
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: dappPub,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    const result = adapter.resumeFromCallback()

    expect(result?.signature).toBeUndefined()
  })

  it('returns null when no pending state exists', () => {
    const adapter = createDeepLinkAdapter(baseOptions())
    // Pending state cleared. Even with a callback URL in window, no resume.
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: new Uint8Array(32),
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    expect(adapter.resumeFromCallback()).toBeNull()
  })

  it('returns null when the URL has no callback parameters', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM })
    window.history.replaceState({}, '', '/?foo=bar')

    expect(adapter.resumeFromCallback()).toBeNull()
    // Pending state stays (we didn't consume it).
    expect(getPendingState()).not.toBeNull()
  })

  it('returns null when decryption fails AND clears pending state (no 10-min wedge)', () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM })
    expect(getPendingState()).not.toBeNull()

    // Encrypt with a DIFFERENT dapp public key — decryption will fail.
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: nacl.box.keyPair().publicKey,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    expect(adapter.resumeFromCallback()).toBeNull()
    // BLOCKER-1 fix: state cleared so a refresh can retry instead of wedging.
    expect(getPendingState()).toBeNull()
  })

  it('clears pre-TASK-108 PendingState records that lack the keypair fields', () => {
    // Simulate a stale record from a prior schema (no ephemeralPublicKey / ephemeralSecretKey).
    const stale = {
      walletId: 'phantom',
      requireSignIn: false,
      timestamp: Date.now(),
    }
    sessionStorage.setItem('@monolithlabs-hub/wc:pendingState', JSON.stringify(stale))
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: nacl.box.keyPair().publicKey,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))

    expect(adapter.resumeFromCallback()).toBeNull()
    expect(getPendingState()).toBeNull()
  })
})

describe('DeepLinkAdapter.disconnect', () => {
  it('clears state and emits disconnect when previously connected', async () => {
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM })
    const pending = getPendingState()
    const dappPub = bs58.decode(pending?.ephemeralPublicKey ?? '')
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: dappPub,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)
    adapter.resumeFromCallback()
    const listener = vi.fn()
    adapter.subscribe(listener)

    await adapter.disconnect()

    expect(adapter.isConnected).toBe(false)
    expect(adapter.publicKey).toBeNull()
    expect(listener).toHaveBeenCalledWith('disconnect')
  })

  it('does not emit disconnect when never connected', async () => {
    const adapter = createDeepLinkAdapter(baseOptions())
    const listener = vi.fn()
    adapter.subscribe(listener)

    await adapter.disconnect()

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('DeepLinkAdapter standalone sign methods', () => {
  it('signMessage throws WalletNotReadyError', async () => {
    const adapter = createDeepLinkAdapter(baseOptions())

    await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toThrow(WalletNotReadyError)
  })

  it('signIn throws WalletNotReadyError', async () => {
    const adapter = createDeepLinkAdapter(baseOptions())

    await expect(adapter.signIn()).rejects.toThrow(WalletNotReadyError)
  })
})

describe('DeepLinkAdapter destroy', () => {
  it('throws on subsequent calls after destroy()', async () => {
    const adapter = createDeepLinkAdapter(baseOptions())
    adapter.destroy()

    await expect(adapter.connect({ wallet: PHANTOM })).rejects.toThrow(/has been destroyed/)
    await expect(adapter.disconnect()).rejects.toThrow(/has been destroyed/)
    expect(() => adapter.resumeFromCallback()).toThrow(/has been destroyed/)
    expect(() => adapter.subscribe(() => {})).toThrow(/has been destroyed/)
  })

  it('is idempotent', () => {
    const adapter = createDeepLinkAdapter(baseOptions())

    expect(() => {
      adapter.destroy()
      adapter.destroy()
    }).not.toThrow()
  })

  it('cancels a pending fallback timer', () => {
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    const cancel = vi.fn()
    const scheduleFallback = vi.fn(() => cancel)
    const adapter = createDeepLinkAdapter(baseOptions({ scheduleFallback }))
    void adapter.connect({ wallet: OPINDEX })

    adapter.destroy()

    expect(cancel).toHaveBeenCalledOnce()
  })
})

describe('DeepLinkAdapter default scheduleFallback', () => {
  let captured: string[]
  let origLocation: Location

  beforeEach(() => {
    vi.useFakeTimers()
    vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
    captured = []
    origLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        get href() {
          return ''
        },
        set href(v: string) {
          captured.push(v)
        },
      } as unknown as Location,
    })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(window, 'location', { configurable: true, value: origLocation })
  })

  it('navigates to the deep link and then the store after the 1500ms timeout', () => {
    const adapter = createDeepLinkAdapter({
      appUrl: 'https://dapp.example.com',
      redirectUrl: 'https://dapp.example.com/cb',
      cluster: 'mainnet-beta',
    })

    void adapter.connect({ wallet: OPINDEX })
    expect(captured[0]).toContain('opindex.app/ul/v1/connect')

    vi.advanceTimersByTime(1500)
    expect(captured[1]).toBe('https://apps.apple.com/app/opindex')
  })

  it('cancels the fallback when the page is hidden (deep link was intercepted)', () => {
    const adapter = createDeepLinkAdapter({
      appUrl: 'https://dapp.example.com',
      redirectUrl: 'https://dapp.example.com/cb',
      cluster: 'mainnet-beta',
    })

    void adapter.connect({ wallet: OPINDEX })
    // Simulate the OS opening the wallet app — page becomes hidden.
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))

    vi.advanceTimersByTime(1500)
    // Only the deep link was navigated, NOT the store URL.
    expect(captured).toHaveLength(1)
    expect(captured[0]).toContain('opindex.app/ul/v1/connect')
  })

  it('destroy() cancels the pending fallback via the returned cancel function', () => {
    const adapter = createDeepLinkAdapter({
      appUrl: 'https://dapp.example.com',
      redirectUrl: 'https://dapp.example.com/cb',
      cluster: 'mainnet-beta',
    })

    void adapter.connect({ wallet: OPINDEX })
    adapter.destroy()

    vi.advanceTimersByTime(2000)
    // Store URL was NOT navigated (destroy cancelled the timer).
    expect(captured.filter((u) => u.includes('apps.apple.com'))).toHaveLength(0)
  })
})

// Sanity: an unrelated saved last-used wallet doesn't break resume.
describe('DeepLinkAdapter resume happy-path with last-used pre-set', () => {
  it('overwrites lastUsedWallet on success', () => {
    saveLastUsedWallet('solflare')
    const navigate = vi.fn<(url: string) => void>()
    const adapter = createDeepLinkAdapter(baseOptions({ navigate }))
    void adapter.connect({ wallet: PHANTOM })
    const pending = getPendingState()
    const dappPub = bs58.decode(pending?.ephemeralPublicKey ?? '')
    const callbackUrl = makeCallbackUrl({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappPublicKey: dappPub,
    })
    const parsed = new URL(callbackUrl)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    adapter.resumeFromCallback()

    expect(getLastUsedWallet()).toBe('phantom')
  })
})
