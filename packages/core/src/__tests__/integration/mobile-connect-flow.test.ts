// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://dapp.example/" }

/**
 * Integration tests for the full mobile deep-link connect flow.
 *
 * These exercise the **real** WalletManager + DeepLinkAdapter +
 * FlowMachine + SessionStore + CallbackHandler stack. The only seams
 * mocked are:
 *
 * - `navigator.userAgent` — stubbed to iPhone so `detectPlatform` returns
 *   the `deeplink` strategy without depending on the test runner's UA.
 * - `createDeepLinkAdapter` — wraps the real implementation to inject a
 *   `navigate` spy (so we can assert what URL the wallet *would* be
 *   handed without jsdom actually trying to follow it).
 * - `sessionStorage` — real jsdom instance, cleared between tests.
 * - `window.location` — mutated via `history.replaceState` to simulate
 *   the post-redirect page load with the wallet's callback URL.
 *
 * The encryption flow is real: we generate a fake "wallet" ephemeral
 * keypair per test, encrypt a Phantom-format payload with `nacl.box`
 * against the dapp's ephemeral public key (read from the
 * SessionStore-persisted pending state), and round-trip through the
 * real CallbackHandler.
 */

import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPendingState,
  getPendingState,
  savePendingState,
  type PendingState,
} from '../../session/store'
import type { FlowState } from '../../state/machine'
import type { WalletConfig } from '../../wallets/sorter'

// --- Module mock: wrap createDeepLinkAdapter to inject navigate spy ------

const mocks = vi.hoisted(() => ({
  navigateSpy: vi.fn<(url: string) => void>(),
}))

vi.mock('../../adapters/deep-link-adapter', async () => {
  const actual = await vi.importActual<typeof import('../../adapters/deep-link-adapter')>(
    '../../adapters/deep-link-adapter',
  )
  return {
    ...actual,
    createDeepLinkAdapter: (
      options: Parameters<typeof actual.createDeepLinkAdapter>[0],
    ): ReturnType<typeof actual.createDeepLinkAdapter> =>
      actual.createDeepLinkAdapter({
        ...options,
        navigate: mocks.navigateSpy,
      }),
  }
})

// Import AFTER vi.mock so the manager picks up the wrapped adapter.
const { createWalletManager } = await import('../../wallet-manager')

// --- Fixtures ------------------------------------------------------------

const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1'

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

// Matches the @vitest-environment-options URL pragma at the top of the
// file. jsdom's default URL is `about:blank` which has a null origin and
// rejects all `history.replaceState` calls — the pragma sets the initial
// jsdom URL so the dapp has a stable HTTPS origin we can replaceState
// within.
const DAPP_ORIGIN = 'https://dapp.example'

// --- Helpers -------------------------------------------------------------

/**
 * Encrypt a Phantom-format response payload against the dapp's ephemeral
 * public key (which the dapp wrote to sessionStorage on `connect`). Returns
 * a fully-qualified callback URL with `phantom_encryption_public_key`,
 * `nonce`, and `data` query params — the same shape a real wallet would
 * redirect back to.
 */
function buildWalletCallbackUrl(payload: {
  publicKey: string
  session: string
  signature?: string
}): string {
  const pending = getPendingState()
  if (!pending) throw new Error('No pending state — call manager.connect() first')

  const dappEphemeralPubKey = bs58.decode(pending.ephemeralPublicKey)

  // Simulate the wallet's side: fresh ephemeral keypair per response,
  // shared secret with our dapp public key.
  const walletKeypair = nacl.box.keyPair()
  const nonce = nacl.randomBytes(24)

  const plaintext: Record<string, string> = {
    public_key: payload.publicKey,
    session: payload.session,
  }
  if (payload.signature !== undefined) plaintext.signature = payload.signature

  const plaintextBytes = new TextEncoder().encode(JSON.stringify(plaintext))
  const ciphertext = nacl.box(
    new Uint8Array(plaintextBytes),
    nonce,
    dappEphemeralPubKey,
    walletKeypair.secretKey,
  )

  const params = new URLSearchParams({
    phantom_encryption_public_key: bs58.encode(walletKeypair.publicKey),
    nonce: bs58.encode(nonce),
    data: bs58.encode(ciphertext),
  })
  return `${DAPP_ORIGIN}/?${params.toString()}`
}

/** Replace the current URL via the History API — no real navigation. */
function navigateTo(url: string): void {
  window.history.replaceState({}, '', url)
}

// --- Setup / teardown ----------------------------------------------------

beforeEach(() => {
  vi.stubGlobal('navigator', { userAgent: IPHONE_UA })
  // Reset to a clean dapp origin so detectPlatform / DeepLinkAdapter
  // observe `window.location.origin === DAPP_ORIGIN`.
  navigateTo(`${DAPP_ORIGIN}/`)
  sessionStorage.clear()
  localStorage.clear()
  mocks.navigateSpy.mockClear()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
  sessionStorage.clear()
  localStorage.clear()
})

// --- Tests ---------------------------------------------------------------

describe('Mobile deep-link connect flow (integration)', () => {
  it('full round trip: tap connect → state saved → callback parsed → onConnected fired', async () => {
    const onConnected = vi.fn()
    const onAuthenticated = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      onConnected,
      onAuthenticated,
      onError,
    })

    // --- Page load 1: tap connect ---
    void manager.connect('phantom')
    // Poll until the navigate spy fires instead of relying on a fixed
    // microtask count — robust against future async-insertion in the
    // connect flow.
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalledOnce())

    // Inspect the dispatched URL via URL parsing rather than substring
    // matching — bulletproof against form-encoding differences (`+` vs
    // `%20`, etc.).
    const dispatchedUrl = new URL(mocks.navigateSpy.mock.calls[0]?.[0] ?? '')
    expect(`${dispatchedUrl.origin}${dispatchedUrl.pathname}`).toBe(
      'https://phantom.app/ul/v1/connect',
    )
    expect(dispatchedUrl.searchParams.get('dapp_encryption_public_key')).toBeTruthy()
    expect(dispatchedUrl.searchParams.get('redirect_link')).toBe(`${DAPP_ORIGIN}/`)
    expect(dispatchedUrl.searchParams.get('app_url')).toBe(DAPP_ORIGIN)

    // Pending state is in sessionStorage.
    const pending = getPendingState()
    expect(pending).not.toBeNull()
    expect(pending?.walletId).toBe('phantom')
    expect(pending?.requireSignIn).toBe(false)
    expect(pending?.ephemeralPublicKey).toBeTruthy()
    expect(pending?.ephemeralSecretKey).toBeTruthy()

    // --- Page load 2: simulate the wallet redirect back ---
    const callbackUrl = buildWalletCallbackUrl({
      publicKey: 'PK_FROM_WALLET',
      session: 'session-token',
    })
    navigateTo(callbackUrl)

    // Build a fresh manager (the previous one is "from a prior page
    // load" conceptually — though in this test it's the same JS
    // instance). The realistic dapp lifecycle is: page reloads, fresh
    // manager picks up the pending state from sessionStorage.
    const resumedManager = createWalletManager({
      wallets: [PHANTOM],
      onConnected,
      onAuthenticated,
      onError,
    })

    // Capture every state transition so we can pin the FlowMachine's
    // observable sequence, not just the terminal state. Consumers
    // (React useSyncExternalStore, Vue subscribe) drive their UI off
    // this stream — regressions here cascade into both packages.
    const stateChanges: FlowState[] = []
    resumedManager.subscribe((state) => stateChanges.push(state))
    resumedManager.initialize()

    expect(onConnected).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith('PK_FROM_WALLET')
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(resumedManager.getState()).toBe('authenticated') // requireSignIn=false auto-steps
    // The FlowMachine fires: connecting → connected → authenticated
    // (the connected→authenticated hop is the auto-step inside
    // `WALLET_CONNECTED` when requireSignIn is false — fires twice in
    // a single send).
    expect(stateChanges).toEqual(['connecting', 'connected', 'authenticated'])
    // Pending state should be cleared after a successful callback parse.
    expect(getPendingState()).toBeNull()
    // Successful resume should remember the wallet for next visit's
    // sorter pinning (TASK-102 / TASK-103 contract).
    expect(localStorage.getItem('lastUsedWallet')).toBe('phantom')

    manager.destroy()
    resumedManager.destroy()
  })

  it('full round trip with sign-in: → onAuthenticated fired', async () => {
    const onConnected = vi.fn()
    const onAuthenticated = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      signInMessage: () => 'Sign in to dapp',
      onConnected,
      onAuthenticated,
    })

    void manager.connect('phantom')
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalled())

    // Sign-and-connect dispatches the same universal-link URL plus the
    // bundled SIWS message — verified at the URL level.
    expect(mocks.navigateSpy).toHaveBeenCalledOnce()
    expect(mocks.navigateSpy.mock.calls[0]?.[0]).toContain('sign_in_message=')

    const callbackUrl = buildWalletCallbackUrl({
      publicKey: 'PK',
      session: 'session-token',
      signature: 'sig-from-wallet-b58',
    })
    navigateTo(callbackUrl)

    const resumedManager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: true,
      signInMessage: () => 'Sign in to dapp',
      onConnected,
      onAuthenticated,
    })
    resumedManager.initialize()

    expect(onConnected).toHaveBeenCalledOnce()
    expect(onConnected).toHaveBeenCalledWith('PK')
    expect(onAuthenticated).toHaveBeenCalledOnce()
    expect(onAuthenticated).toHaveBeenCalledWith('PK', 'sig-from-wallet-b58')
    expect(resumedManager.getState()).toBe('authenticated')
    expect(resumedManager.getContext().signature).toBe('sig-from-wallet-b58')

    manager.destroy()
    resumedManager.destroy()
  })

  it('requireSignIn: false ignores a wallet-supplied signature in the callback', async () => {
    // Stronger version of "requireSignIn: false skips signing":
    // simulate a wallet that returns a signature ANYWAY (mis-configured
    // wallet, or the user opted into SIWS on the wallet side but the
    // dapp config said no). The dapp's `requireSignIn: false` is the
    // source of truth — onAuthenticated MUST stay silent.
    //
    // Locks the contract that the sign step is dapp-driven, not
    // wallet-driven.
    const onConnected = vi.fn()
    const onAuthenticated = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: false,
      onConnected,
      onAuthenticated,
    })

    void manager.connect('phantom')
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalled())

    // Wallet returns a signature even though the dapp didn't request one.
    const callbackUrl = buildWalletCallbackUrl({
      publicKey: 'PK',
      session: 'session-token',
      signature: 'unexpected-signature-from-wallet',
    })
    navigateTo(callbackUrl)

    const resumed = createWalletManager({
      wallets: [PHANTOM],
      requireSignIn: false,
      onConnected,
      onAuthenticated,
    })
    resumed.initialize()

    expect(onConnected).toHaveBeenCalledOnce()
    // The unexpected signature is ignored — the dapp's config wins.
    expect(onAuthenticated).not.toHaveBeenCalled()
    expect(resumed.getState()).toBe('authenticated') // auto-step on requireSignIn=false
    // And — critically — the signature is NOT in the FlowMachine
    // context either. The dapp simply doesn't observe it.
    expect(resumed.getContext().signature).toBeNull()

    manager.destroy()
    resumed.destroy()
  })

  it('stale pending state (>10 min) is discarded on callback', async () => {
    const onConnected = vi.fn()
    const onError = vi.fn()

    // Hand-roll a pending state that's older than the 10-minute TTL —
    // simulates a tab the user left open over lunch before returning
    // through a callback URL.
    const fakeKeypair = nacl.box.keyPair()
    const stalePending: PendingState = {
      walletId: 'phantom',
      requireSignIn: false,
      timestamp: Date.now() - 11 * 60 * 1000, // 11 minutes ago
      ephemeralPublicKey: bs58.encode(fakeKeypair.publicKey),
      ephemeralSecretKey: bs58.encode(fakeKeypair.secretKey),
    }
    savePendingState(stalePending)
    // SessionStore returns null for stale records AND clears them as a
    // side effect on the next read — so we can't use buildWalletCallbackUrl
    // (which reads pending state). Encrypt against the stale keypair
    // directly.
    const nonce = nacl.randomBytes(24)
    const walletKeypair = nacl.box.keyPair()
    const cipher = nacl.box(
      // `new Uint8Array(...)` wrap is needed because tweetnacl's
      // `instanceof Uint8Array` check rejects the array
      // `TextEncoder.encode()` produces under some jsdom realms.
      // See CLAUDE.md TASK-106 note.
      new Uint8Array(
        new TextEncoder().encode(JSON.stringify({ public_key: 'PK', session: 'session-token' })),
      ),
      nonce,
      fakeKeypair.publicKey,
      walletKeypair.secretKey,
    )
    const params = new URLSearchParams({
      phantom_encryption_public_key: bs58.encode(walletKeypair.publicKey),
      nonce: bs58.encode(nonce),
      data: bs58.encode(cipher),
    })
    navigateTo(`${DAPP_ORIGIN}/?${params.toString()}`)

    const resumed = createWalletManager({
      wallets: [PHANTOM],
      onConnected,
      onError,
    })
    resumed.initialize()

    // Stale pending state is cleared on read; manager.initialize sees
    // null and bails before touching the callback URL. No callbacks
    // fire, no error — the user just sees the disconnected state.
    expect(onConnected).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(resumed.getState()).toBe('idle')
    expect(getPendingState()).toBeNull()

    resumed.destroy()
  })

  it('malformed callback URL is handled gracefully (no crash, no onConnected)', async () => {
    const onConnected = vi.fn()
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [PHANTOM],
      onConnected,
      onError,
    })

    void manager.connect('phantom')
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalled())

    // Garbage in the `data` param — fails base58 decode AND/OR
    // decryption AND/OR JSON parse. parseCallback returns null and
    // resumeFromCallback clears the pending state (per TASK-108 docs:
    // "clears so the user can retry instead of getting wedged for the
    // 10-minute staleness window").
    const params = new URLSearchParams({
      phantom_encryption_public_key: bs58.encode(nacl.box.keyPair().publicKey),
      nonce: bs58.encode(nacl.randomBytes(24)),
      data: 'this-is-not-valid-base58-or-encrypted-data',
    })
    navigateTo(`${DAPP_ORIGIN}/?${params.toString()}`)

    const resumed = createWalletManager({
      wallets: [PHANTOM],
      onConnected,
      onError,
    })

    expect(() => resumed.initialize()).not.toThrow()
    expect(onConnected).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(resumed.getState()).toBe('idle')
    expect(getPendingState()).toBeNull()

    manager.destroy()
    resumed.destroy()
  })

  it('Opindex App Store redirect fires after 1500ms when not installed (iOS)', async () => {
    // Fake timers MUST be installed before `manager.connect` — the
    // DeepLinkAdapter's default scheduleFallback calls `setTimeout` at
    // connect time, and `vi.useFakeTimers` only intercepts subsequent
    // timer registrations. NOTE: do not use `vi.waitFor` here — under
    // fake timers its internal polling never resolves unless we
    // `vi.advanceTimersByTime`. A single microtask flush is enough
    // because the navigate spy fires synchronously inside the
    // adapter's `startRedirect` (no `await` between `connect` and
    // navigate).
    vi.useFakeTimers()
    const manager = createWalletManager({
      wallets: [OPINDEX, PHANTOM],
    })

    void manager.connect('opindex')
    await Promise.resolve()

    // First navigation fires synchronously: the wallet's universal-link
    // deep link. The DeepLinkAdapter then schedules a 1500ms fallback
    // to the App Store URL.
    expect(mocks.navigateSpy).toHaveBeenCalledTimes(1)
    expect(mocks.navigateSpy.mock.calls[0]?.[0]).toMatch(/^https:\/\/opindex\.app\/ul\/v1\/connect/)

    // Advance under 1500ms — fallback has NOT fired yet.
    vi.advanceTimersByTime(1499)
    expect(mocks.navigateSpy).toHaveBeenCalledTimes(1)

    // Crossing the threshold triggers the App Store navigation.
    vi.advanceTimersByTime(2)
    expect(mocks.navigateSpy).toHaveBeenCalledTimes(2)
    expect(mocks.navigateSpy.mock.calls[1]?.[0]).toBe(OPINDEX.appStoreUrl)

    manager.destroy()
    // Ensure no leftover pending state pollutes subsequent tests — the
    // global afterEach clears, but be explicit since this test diverges
    // from the happy-path resume flow.
    clearPendingState()
  })

  it('Opindex Play Store redirect fires after 1500ms when not installed (Android)', async () => {
    // Mirror of the iOS test for the Android branch in the
    // DeepLinkAdapter's storeUrl selection
    // (`userAgentIsAndroid() ? playStoreUrl : appStoreUrl`).
    const ANDROID_UA =
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
    vi.stubGlobal('navigator', { userAgent: ANDROID_UA })

    vi.useFakeTimers()
    const manager = createWalletManager({
      wallets: [OPINDEX, PHANTOM],
    })

    void manager.connect('opindex')
    await Promise.resolve()

    expect(mocks.navigateSpy).toHaveBeenCalledTimes(1)
    expect(mocks.navigateSpy.mock.calls[0]?.[0]).toMatch(/^https:\/\/opindex\.app\/ul\/v1\/connect/)

    vi.advanceTimersByTime(1501)
    expect(mocks.navigateSpy).toHaveBeenCalledTimes(2)
    expect(mocks.navigateSpy.mock.calls[1]?.[0]).toBe(OPINDEX.playStoreUrl)

    manager.destroy()
    clearPendingState()
  })
})

// Opindex as it really is: no universalLink (no external connect protocol),
// just a download/landing page. Marked "install/open-only".
const OPINDEX_INSTALL_ONLY: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '',
  deepLinkScheme: 'opindexwallet://',
  installUrl: 'https://opindex.deeptap.io',
}

describe('Mobile install/open-only wallet (Opindex has no deep-link connect)', () => {
  it('routes to installUrl, leaves no pending state, and returns to idle', async () => {
    const onError = vi.fn()
    const manager = createWalletManager({
      wallets: [OPINDEX_INSTALL_ONLY, PHANTOM],
      onError,
    })

    await manager.connect('opindex')

    expect(mocks.navigateSpy).toHaveBeenCalledWith('https://opindex.deeptap.io')
    expect(getPendingState()).toBeNull()
    expect(manager.getState()).toBe('idle')
    expect(onError).not.toHaveBeenCalled()

    manager.destroy()
  })
})

describe('Mobile deep-link recovery on abandoned return (issue 2)', () => {
  it('un-freezes the modal when the user returns without completing connect', async () => {
    const manager = createWalletManager({ wallets: [PHANTOM] })
    const states: FlowState[] = []
    manager.subscribe((s) => states.push(s))

    // Tap connect → navigates away, machine enters 'connecting'.
    void manager.connect('phantom')
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalledTimes(1))
    expect(manager.getState()).toBe('connecting')
    expect(getPendingState()).not.toBeNull()

    // User switches back WITHOUT a callback in the URL (clean dapp origin).
    document.dispatchEvent(new Event('visibilitychange'))

    // Flow is reset to idle so the UI re-enables.
    expect(manager.getState()).toBe('idle')
    expect(states).toContain('idle')

    // And a fresh connect for ANY wallet is now accepted (not wedged).
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalledTimes(1))
    void manager.connect('phantom')
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalledTimes(2))

    manager.destroy()
  })

  it('completes the connection when the return DOES carry a valid callback (pageshow)', async () => {
    const onConnected = vi.fn()
    const manager = createWalletManager({ wallets: [PHANTOM], onConnected })

    void manager.connect('phantom')
    await vi.waitFor(() => expect(mocks.navigateSpy).toHaveBeenCalledTimes(1))

    // Simulate the wallet redirect arriving on the SAME context (bfcache).
    const callbackUrl = buildWalletCallbackUrl({
      publicKey: 'PK_FROM_WALLET',
      session: 'session-token',
    })
    navigateTo(callbackUrl)
    window.dispatchEvent(new Event('pageshow'))

    expect(onConnected).toHaveBeenCalledWith('PK_FROM_WALLET')
    expect(manager.getState()).toBe('authenticated')
    expect(getPendingState()).toBeNull()

    manager.destroy()
  })
})
