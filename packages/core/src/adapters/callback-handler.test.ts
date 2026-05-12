import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  type CallbackResult,
  extractCallbackFromCurrentUrl,
  isCallbackUrl,
  parseCallback,
} from './callback-handler'
import { type EphemeralKeypair, generateEphemeralKeypair } from './deep-link-builder'

/**
 * Simulate the Phantom-side encryption of a callback payload using the
 * dapp's public key and Phantom's own (simulated) keypair. Mirrors what
 * the real wallet does before redirecting back to the dapp.
 */
function makeEncryptedCallback(opts: {
  baseUrl: string
  payload: Record<string, unknown>
  dappKeypair: EphemeralKeypair
  walletKeypair?: EphemeralKeypair
}): { url: string; walletKeypair: EphemeralKeypair } {
  const walletKeypair = opts.walletKeypair ?? generateEphemeralKeypair()
  const nonce = nacl.randomBytes(24)
  const shared = nacl.box.before(opts.dappKeypair.publicKey, walletKeypair.secretKey)
  // Coerce to a fresh Uint8Array — tweetnacl's strict instanceof check rejects
  // TextEncoder's output across some jsdom realms.
  const plaintext = new Uint8Array(new TextEncoder().encode(JSON.stringify(opts.payload)))
  const cipher = nacl.box.after(plaintext, nonce, shared)

  const url = new URL(opts.baseUrl)
  url.searchParams.set('phantom_encryption_public_key', bs58.encode(walletKeypair.publicKey))
  url.searchParams.set('nonce', bs58.encode(nonce))
  url.searchParams.set('data', bs58.encode(cipher))
  return { url: url.toString(), walletKeypair }
}

const DAPP_BASE = 'https://dapp.example.com/cb'
const FAKE_PUBKEY = 'B1bQrkRoy3oUL7fXJBQVDqkqu6Yk2HFwoejPpc4mtBnY'
const FAKE_SESSION = 'session-token-abc'
const FAKE_SIGNATURE = '3p1NbVdsdY8Pn5C2vG78tA4uJ8X5L3kPq6vKnY3wWzR'

describe('isCallbackUrl', () => {
  it('returns true for a Phantom callback URL', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    expect(isCallbackUrl(url)).toBe(true)
  })

  it('returns false for a normal page URL', () => {
    expect(isCallbackUrl('https://dapp.example.com')).toBe(false)
    expect(isCallbackUrl('https://dapp.example.com/cb?session=abc')).toBe(false)
  })

  it('returns false for an error-callback URL (errorCode/errorMessage only)', () => {
    expect(
      isCallbackUrl('https://dapp.example.com/cb?errorCode=4001&errorMessage=user_rejected'),
    ).toBe(false)
  })

  it('returns false for a malformed URL string', () => {
    expect(isCallbackUrl('not a url')).toBe(false)
    expect(isCallbackUrl('')).toBe(false)
  })

  it('returns false when only some of the three params are present', () => {
    expect(
      isCallbackUrl('https://dapp.example.com/cb?phantom_encryption_public_key=abc&nonce=def'),
    ).toBe(false)
  })
})

describe('parseCallback', () => {
  it('decrypts and returns publicKey + session', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    const result = parseCallback(url, dapp)

    expect(result).toEqual<CallbackResult>({
      publicKey: FAKE_PUBKEY,
      session: FAKE_SESSION,
    })
  })

  it('returns the signature when sign-and-connect was used', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: {
        public_key: FAKE_PUBKEY,
        session: FAKE_SESSION,
        signature: FAKE_SIGNATURE,
      },
      dappKeypair: dapp,
    })

    const result = parseCallback(url, dapp)

    expect(result).toEqual<CallbackResult>({
      publicKey: FAKE_PUBKEY,
      session: FAKE_SESSION,
      signature: FAKE_SIGNATURE,
    })
  })

  it('returns null when callback params are missing entirely', () => {
    const dapp = generateEphemeralKeypair()

    expect(parseCallback('https://dapp.example.com/cb', dapp)).toBeNull()
  })

  it('returns null on a malformed URL string (no throw)', () => {
    const dapp = generateEphemeralKeypair()

    expect(() => parseCallback('not a url', dapp)).not.toThrow()
    expect(parseCallback('not a url', dapp)).toBeNull()
  })

  it('returns null when the wallet public key is not 32 bytes', () => {
    const dapp = generateEphemeralKeypair()
    const url = new URL(DAPP_BASE)
    url.searchParams.set('phantom_encryption_public_key', bs58.encode(new Uint8Array(16)))
    url.searchParams.set('nonce', bs58.encode(new Uint8Array(24)))
    url.searchParams.set('data', bs58.encode(new Uint8Array(32)))

    expect(parseCallback(url.toString(), dapp)).toBeNull()
  })

  it('returns null when the nonce is not 24 bytes', () => {
    const dapp = generateEphemeralKeypair()
    const url = new URL(DAPP_BASE)
    url.searchParams.set('phantom_encryption_public_key', bs58.encode(new Uint8Array(32)))
    url.searchParams.set('nonce', bs58.encode(new Uint8Array(12)))
    url.searchParams.set('data', bs58.encode(new Uint8Array(32)))

    expect(parseCallback(url.toString(), dapp)).toBeNull()
  })

  it('returns null when decryption fails (wrong dapp secret key)', () => {
    const dapp = generateEphemeralKeypair()
    const attacker = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, attacker)).toBeNull()
  })

  it('returns null when decrypted JSON has the wrong shape', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      // Missing `public_key`.
      payload: { session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when decrypted public_key is an empty string', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: '', session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when decrypted session is an empty string', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: '' },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when decrypted signature is present but not a string', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION, signature: 123 },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('treats an absent signature field as a connect-only result (no signature property)', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    const result = parseCallback(url, dapp)

    expect(result).not.toBeNull()
    expect(result?.signature).toBeUndefined()
  })

  it('returns null on base58-decode failure (non-alphabet characters)', () => {
    const dapp = generateEphemeralKeypair()
    const url =
      'https://dapp.example.com/cb?phantom_encryption_public_key=0OIl&nonce=0OIl&data=0OIl'

    expect(parseCallback(url, dapp)).toBeNull()
  })
})

describe('extractCallbackFromCurrentUrl', () => {
  const realLocation = window.location
  const realHistory = window.history

  afterEach(() => {
    vi.unstubAllGlobals()
    // jsdom: restore the real location/history references in case a test stubbed them.
    Object.defineProperty(window, 'location', { value: realLocation, configurable: true })
    Object.defineProperty(window, 'history', { value: realHistory, configurable: true })
    // Reset the URL back to about:blank-ish for isolation.
    realHistory.replaceState({}, '', '/')
  })

  it('reads window.location and decodes the current callback', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })
    window.history.replaceState({}, '', new URL(url).pathname + new URL(url).search)

    const result = extractCallbackFromCurrentUrl(dapp)

    expect(result).toEqual<CallbackResult>({
      publicKey: FAKE_PUBKEY,
      session: FAKE_SESSION,
    })
  })

  it('cleans callback params from the URL after a successful parse', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })
    const parsed = new URL(url)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)
    expect(window.location.search).toContain('phantom_encryption_public_key')

    extractCallbackFromCurrentUrl(dapp)

    expect(window.location.search).not.toContain('phantom_encryption_public_key')
    expect(window.location.search).not.toContain('nonce')
    expect(window.location.search).not.toContain('data')
  })

  it('does not modify the URL when no callback params are present', () => {
    const dapp = generateEphemeralKeypair()
    window.history.replaceState({}, '', '/some/path?foo=bar')
    const before = window.location.search

    const result = extractCallbackFromCurrentUrl(dapp)

    expect(result).toBeNull()
    expect(window.location.search).toBe(before)
  })

  it('does not modify the URL when parse fails (e.g., decryption error)', () => {
    const attacker = generateEphemeralKeypair()
    const otherDapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: 'https://dapp.example.com/cb',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: otherDapp,
    })
    const parsed = new URL(url)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)
    const before = window.location.search

    const result = extractCallbackFromCurrentUrl(attacker)

    expect(result).toBeNull()
    expect(window.location.search).toBe(before)
  })

  it('returns null in SSR (no window)', () => {
    vi.stubGlobal('window', undefined)
    const dapp = generateEphemeralKeypair()

    expect(extractCallbackFromCurrentUrl(dapp)).toBeNull()
  })
})
