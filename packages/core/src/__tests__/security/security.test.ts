// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://dapp.example/" }

/**
 * Security-themed test suite for TASK-701 — locks in the defensive
 * behaviors verified during the security audit so a future regression
 * breaks CI loudly.
 *
 * Organized by audit focus area:
 *   1. Deep-link URL construction — injection / scheme smuggling / encoding
 *   2. Callback handler — adversarial payloads / prototype pollution / oversized inputs
 *   3. Callback handler — URL-cleanup invariants
 *   4. Session storage — schema tampering / pollution defense
 *   5. RNG sanity — keypair entropy across calls
 *
 * The "no `Math.random` in production code" regression guard lives in
 * `eslint.config.mjs` (no-restricted-syntax) — it runs on every PR
 * via `pnpm turbo lint` and does not need a runtime test.
 */

import bs58 from 'bs58'
import nacl from 'tweetnacl'
import { afterEach, describe, expect, it } from 'vitest'

import { extractCallbackFromCurrentUrl, parseCallback } from '../../adapters/callback-handler'
import {
  type EphemeralKeypair,
  buildConnectUrl,
  buildSignAndConnectUrl,
  generateEphemeralKeypair,
} from '../../adapters/deep-link-builder'
import { clearPendingState, getPendingState, savePendingState } from '../../session/store'
import type { WalletConfig } from '../../wallets/sorter'

// --- Fixtures ------------------------------------------------------------

const phantom: WalletConfig = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const fixedKeypair: EphemeralKeypair = {
  publicKey: new Uint8Array(32).fill(0xab),
  secretKey: new Uint8Array(32).fill(0xcd),
}

function baseConnectOptions(overrides: Partial<Parameters<typeof buildConnectUrl>[1]> = {}) {
  return {
    redirectUrl: 'https://dapp.example.com/callback',
    appUrl: 'https://dapp.example.com',
    cluster: 'mainnet-beta' as const,
    ephemeralKeypair: fixedKeypair,
    ...overrides,
  }
}

const FAKE_PUBKEY = 'B1bQrkRoy3oUL7fXJBQVDqkqu6Yk2HFwoejPpc4mtBnY'
const FAKE_SESSION = 'session-token-abc'
const DAPP_BASE = 'https://dapp.example.com/cb'

/**
 * Simulate the wallet-side encryption of a callback payload. Mirrors the
 * helper in `callback-handler.test.ts` — kept inline so the security
 * suite is self-contained and a refactor of the callback-handler tests
 * cannot silently break the audit guarantees.
 */
function makeEncryptedCallback(opts: {
  baseUrl: string
  payload: Record<string, unknown> | unknown[] | string | number | null
  dappKeypair: EphemeralKeypair
  walletKeypair?: EphemeralKeypair
}): { url: string; walletKeypair: EphemeralKeypair } {
  const walletKeypair = opts.walletKeypair ?? generateEphemeralKeypair()
  const nonce = nacl.randomBytes(24)
  const shared = nacl.box.before(opts.dappKeypair.publicKey, walletKeypair.secretKey)
  const plaintext = new Uint8Array(new TextEncoder().encode(JSON.stringify(opts.payload)))
  const cipher = nacl.box.after(plaintext, nonce, shared)

  const url = new URL(opts.baseUrl)
  url.searchParams.set('phantom_encryption_public_key', bs58.encode(walletKeypair.publicKey))
  url.searchParams.set('nonce', bs58.encode(nonce))
  url.searchParams.set('data', bs58.encode(cipher))
  return { url: url.toString(), walletKeypair }
}

// --- 1. Deep-link URL construction --------------------------------------

describe('Security — deep-link URL construction', () => {
  it('rejects javascript: scheme in redirectUrl', () => {
    expect(() =>
      buildConnectUrl(phantom, baseConnectOptions({ redirectUrl: 'javascript:alert(1)' })),
    ).toThrow(/redirectUrl must use http\(s\)/)
  })

  it('rejects data: scheme in redirectUrl', () => {
    expect(() =>
      buildConnectUrl(
        phantom,
        baseConnectOptions({ redirectUrl: 'data:text/html,<script>alert(1)</script>' }),
      ),
    ).toThrow(/redirectUrl must use http\(s\)/)
  })

  it('rejects file: scheme in redirectUrl', () => {
    expect(() =>
      buildConnectUrl(phantom, baseConnectOptions({ redirectUrl: 'file:///etc/passwd' })),
    ).toThrow(/redirectUrl must use http\(s\)/)
  })

  it('rejects protocol-relative redirectUrl (//evil.com)', () => {
    expect(() =>
      buildConnectUrl(phantom, baseConnectOptions({ redirectUrl: '//evil.com/path' })),
    ).toThrow(/redirectUrl must be an absolute http\(s\) URL/)
  })

  it('rejects ftp: scheme in appUrl', () => {
    expect(() =>
      buildConnectUrl(phantom, baseConnectOptions({ appUrl: 'ftp://example.com/' })),
    ).toThrow(/appUrl must use http\(s\)/)
  })

  it('does not smuggle extra query params via an attacker-controlled redirectUrl', () => {
    // An attacker-supplied redirectUrl includes `&redirect_link=evil` — the
    // builder MUST encode this into the value of `redirect_link`, never
    // append it as a sibling param the wallet would parse.
    const malicious = 'https://example.com/?evil=1&redirect_link=https://attacker.test'
    const url = buildConnectUrl(phantom, baseConnectOptions({ redirectUrl: malicious }))
    const params = new URL(url).searchParams

    // There is exactly one `redirect_link` param — and it carries the full
    // attacker URL as a string, not a fragment of it.
    const all = params.getAll('redirect_link')
    expect(all).toHaveLength(1)
    expect(all[0]).toBe(malicious)
    // The attacker's value did not become a top-level `evil` param.
    expect(params.get('evil')).toBeNull()
  })

  it('percent-encodes CRLF in signInMessage (no header-injection style smuggling)', () => {
    const crlf = 'Sign in to Opindex\r\n\r\nGET /admin HTTP/1.1'
    const url = buildSignAndConnectUrl(phantom, {
      ...baseConnectOptions(),
      signInMessage: crlf,
    })

    // Raw CRLF must not appear in the URL string.
    expect(url).not.toContain('\r')
    expect(url).not.toContain('\n')
    expect(url).toContain('%0D%0A')
    // Round-trip back through URLSearchParams gives the original string.
    expect(new URL(url).searchParams.get('sign_in_message')).toBe(crlf)
  })

  it('percent-encodes & and = in signInMessage so they cannot smuggle params', () => {
    const tricky = 'sign me in & redirect=evil'
    const url = buildSignAndConnectUrl(phantom, {
      ...baseConnectOptions(),
      signInMessage: tricky,
    })
    const params = new URL(url).searchParams

    // The literal `&` from the message must not have created a `redirect` param.
    expect(params.get('redirect')).toBeNull()
    // The full message round-trips intact.
    expect(params.get('sign_in_message')).toBe(tricky)
  })

  it('percent-encodes embedded null bytes in appUrl', () => {
    // URL constructor accepts http(s) URLs with embedded NUL bytes; the
    // builder must percent-encode them in the value rather than letting
    // a raw NUL hit the wire.
    const withNul = 'http://example.com/path\x00evil'
    const url = buildConnectUrl(phantom, baseConnectOptions({ appUrl: withNul }))

    expect(url).not.toContain('\x00')
    expect(url).toContain('%00')
  })

  it('rejects an unknown cluster value (whitelist enforcement)', () => {
    expect(() =>
      buildConnectUrl(
        phantom,
        baseConnectOptions({
          cluster: 'mainnet-beta; DROP TABLE wallets;--' as unknown as 'devnet',
        }),
      ),
    ).toThrow(/cluster must be 'mainnet-beta' or 'devnet'/)
  })

  it('never includes the secret key half in any URL the builder produces (security invariant)', () => {
    const connect = buildConnectUrl(phantom, baseConnectOptions())
    const signConnect = buildSignAndConnectUrl(phantom, {
      ...baseConnectOptions(),
      signInMessage: 'hello',
    })
    const secretB58 = bs58.encode(fixedKeypair.secretKey)

    expect(connect).not.toContain(secretB58)
    expect(signConnect).not.toContain(secretB58)
  })
})

// --- 2. Callback handler — adversarial payloads -------------------------

describe('Security — callback adversarial payloads', () => {
  // Defense in depth: snapshot Object.prototype before each pollution
  // attempt and confirm it is unchanged after.
  function objectPrototypeUnpolluted(): boolean {
    const probe = {} as Record<string, unknown>
    return (
      probe.polluted === undefined &&
      probe.isAdmin === undefined &&
      !Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')
    )
  }

  afterEach(() => {
    // Belt-and-suspenders: if a test somehow polluted Object.prototype,
    // delete the probe keys so subsequent tests see a clean slate.
    delete (Object.prototype as Record<string, unknown>).polluted
    delete (Object.prototype as Record<string, unknown>).isAdmin
  })

  it('does not pollute Object.prototype via __proto__ in decrypted JSON', () => {
    const dapp = generateEphemeralKeypair()
    // Hand-craft a payload string with a literal `__proto__` key — using
    // an object literal would let v8 short-circuit the special key. The
    // raw JSON parse path is what we're guarding.
    const plaintext = `{"public_key":"${FAKE_PUBKEY}","session":"${FAKE_SESSION}","__proto__":{"polluted":true}}`
    const walletKeypair = generateEphemeralKeypair()
    const nonce = nacl.randomBytes(24)
    const shared = nacl.box.before(dapp.publicKey, walletKeypair.secretKey)
    const cipher = nacl.box.after(
      new Uint8Array(new TextEncoder().encode(plaintext)),
      nonce,
      shared,
    )
    const url = new URL(DAPP_BASE)
    url.searchParams.set('phantom_encryption_public_key', bs58.encode(walletKeypair.publicKey))
    url.searchParams.set('nonce', bs58.encode(nonce))
    url.searchParams.set('data', bs58.encode(cipher))

    const result = parseCallback(url.toString(), dapp)

    // Either the parser accepted the payload (mapping public_key/session
    // through), or it rejected the payload outright — either is fine.
    // What matters: Object.prototype is untouched.
    expect(objectPrototypeUnpolluted()).toBe(true)
    if (result !== null) {
      expect(result.publicKey).toBe(FAKE_PUBKEY)
      expect(result.session).toBe(FAKE_SESSION)
    }
  })

  it('does not pollute Object.prototype via constructor.prototype in decrypted JSON', () => {
    const dapp = generateEphemeralKeypair()
    const plaintext = `{"public_key":"${FAKE_PUBKEY}","session":"${FAKE_SESSION}","constructor":{"prototype":{"polluted":true}}}`
    const walletKeypair = generateEphemeralKeypair()
    const nonce = nacl.randomBytes(24)
    const shared = nacl.box.before(dapp.publicKey, walletKeypair.secretKey)
    const cipher = nacl.box.after(
      new Uint8Array(new TextEncoder().encode(plaintext)),
      nonce,
      shared,
    )
    const url = new URL(DAPP_BASE)
    url.searchParams.set('phantom_encryption_public_key', bs58.encode(walletKeypair.publicKey))
    url.searchParams.set('nonce', bs58.encode(nonce))
    url.searchParams.set('data', bs58.encode(cipher))

    parseCallback(url.toString(), dapp)

    expect(objectPrototypeUnpolluted()).toBe(true)
  })

  it('returns null when the decrypted JSON is an array (not an object)', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: [1, 2, 3],
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when the decrypted JSON is the string "null"', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: null,
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when the decrypted JSON is a top-level string', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: 'not an object',
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when the decrypted JSON is a number', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: 42,
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when public_key is a number, not a string', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: 42, session: FAKE_SESSION },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when signature is null (rather than silently dropping it)', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION, signature: null },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('returns null when signature is an object (rather than silently dropping it)', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: {
        public_key: FAKE_PUBKEY,
        session: FAKE_SESSION,
        signature: { malicious: true },
      },
      dappKeypair: dapp,
    })

    expect(parseCallback(url, dapp)).toBeNull()
  })

  it('handles larger-than-expected base58 data without throwing', () => {
    // 4KB of random bytes — ~10x larger than any real Phantom callback
    // (real payloads are ~200-500 bytes). Catches a regression where
    // a "size sanity check" got accidentally tightened to reject any
    // longer-than-expected input by throwing instead of returning null.
    //
    // Note: bs58 decode is intrinsically O(n²) over input length, so we
    // do NOT pin a timing ceiling here — at very large sizes (256KB+)
    // the decode is slow but not exploitable: the attacker would need
    // to phish the user into a callback URL they constructed, by which
    // point they have far easier attack surface. Documented as accepted
    // in the TASK-701 audit notes.
    const dapp = generateEphemeralKeypair()
    const big = nacl.randomBytes(4 * 1024)
    const url = new URL(DAPP_BASE)
    url.searchParams.set('phantom_encryption_public_key', bs58.encode(new Uint8Array(32)))
    url.searchParams.set('nonce', bs58.encode(new Uint8Array(24)))
    url.searchParams.set('data', bs58.encode(big))

    expect(() => parseCallback(url.toString(), dapp)).not.toThrow()
    expect(parseCallback(url.toString(), dapp)).toBeNull()
  })

  it('returns null on truncated ciphertext (decode succeeds, decryption fails)', () => {
    const dapp = generateEphemeralKeypair()
    const walletKp = generateEphemeralKeypair()
    const url = new URL(DAPP_BASE)
    url.searchParams.set('phantom_encryption_public_key', bs58.encode(walletKp.publicKey))
    url.searchParams.set('nonce', bs58.encode(new Uint8Array(24)))
    // 8 bytes is well below the nacl.box minimum (16-byte Poly1305 tag).
    url.searchParams.set('data', bs58.encode(new Uint8Array(8)))

    expect(parseCallback(url.toString(), dapp)).toBeNull()
  })

  it('returns null when the nonce is the right length but wrong value (MAC mismatch)', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: DAPP_BASE,
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })
    const tampered = new URL(url)
    tampered.searchParams.set('nonce', bs58.encode(nacl.randomBytes(24)))

    expect(parseCallback(tampered.toString(), dapp)).toBeNull()
  })
})

// --- 3. Callback URL-cleanup invariants ---------------------------------

describe('Security — callback URL cleanup', () => {
  const realLocation = window.location
  const realHistory = window.history

  afterEach(() => {
    Object.defineProperty(window, 'location', { value: realLocation, configurable: true })
    Object.defineProperty(window, 'history', { value: realHistory, configurable: true })
    realHistory.replaceState({}, '', '/')
  })

  it('preserves non-callback query params when stripping callback params on success', () => {
    const dapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: 'https://dapp.example.com/cb?foo=bar&keep=me',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: dapp,
    })
    const parsed = new URL(url)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)

    extractCallbackFromCurrentUrl(dapp)

    const after = window.location.search
    expect(after).not.toContain('phantom_encryption_public_key')
    expect(after).not.toContain('nonce')
    expect(after).not.toContain('data')
    // Non-callback params survive untouched.
    expect(after).toContain('foo=bar')
    expect(after).toContain('keep=me')
  })

  it('does not run history.replaceState when parse fails', () => {
    const attacker = generateEphemeralKeypair()
    const otherDapp = generateEphemeralKeypair()
    const { url } = makeEncryptedCallback({
      baseUrl: 'https://dapp.example.com/cb?foo=bar',
      payload: { public_key: FAKE_PUBKEY, session: FAKE_SESSION },
      dappKeypair: otherDapp,
    })
    const parsed = new URL(url)
    window.history.replaceState({}, '', parsed.pathname + parsed.search)
    const before = window.location.search

    const result = extractCallbackFromCurrentUrl(attacker)

    expect(result).toBeNull()
    // The full URL — including the callback params — is preserved so the
    // user can retry, debug, or re-attempt parsing in a different tab.
    expect(window.location.search).toBe(before)
    expect(window.location.search).toContain('phantom_encryption_public_key')
  })
})

// --- 4. Session storage — schema tampering / pollution ------------------

describe('Security — session storage tampering', () => {
  const PENDING_KEY = '@monolithlabs/wc:pendingState'

  afterEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    clearPendingState()
    delete (Object.prototype as Record<string, unknown>).polluted
    delete (Object.prototype as Record<string, unknown>).isAdmin
  })

  it('clears the bad entry when the persisted JSON has a wrong-shape field', () => {
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        walletId: 42, // should be string
        requireSignIn: false,
        timestamp: Date.now(),
        ephemeralPublicKey: 'pub',
        ephemeralSecretKey: 'sec',
      }),
    )

    expect(getPendingState()).toBeNull()
    // The bad entry MUST be removed — a tampered entry that survived
    // would re-trigger the same `null` result on every read forever.
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull()
  })

  it('does not pollute Object.prototype when persisted state contains __proto__', () => {
    // Hand-craft the JSON so the literal `__proto__` key survives. Going
    // through `JSON.stringify` on an object literal would not produce
    // the special-cased property; we have to write the raw payload.
    sessionStorage.setItem(
      PENDING_KEY,
      `{"walletId":"phantom","requireSignIn":false,"timestamp":${Date.now()},"ephemeralPublicKey":"pub","ephemeralSecretKey":"sec","__proto__":{"polluted":true}}`,
    )

    getPendingState()

    const probe = {} as Record<string, unknown>
    expect(probe.polluted).toBeUndefined()
  })

  it('treats a future timestamp as fresh (intentional — clock skew is not adversarial here)', () => {
    // A tampered/forward-skewed timestamp does not extend the attack
    // window beyond what an attacker with sessionStorage write access
    // already has. Document the behavior so a future tightening (e.g.,
    // rejecting timestamps > now) is an explicit choice, not an
    // accident.
    const future = Date.now() + 60 * 60 * 1000 // +1 hour
    sessionStorage.setItem(
      PENDING_KEY,
      JSON.stringify({
        walletId: 'phantom',
        requireSignIn: false,
        timestamp: future,
        ephemeralPublicKey: 'pub',
        ephemeralSecretKey: 'sec',
      }),
    )

    expect(getPendingState()).not.toBeNull()
  })

  it('re-clears a stale entry that survived (defense against partial-clear bugs)', () => {
    const stale = {
      walletId: 'phantom',
      requireSignIn: false,
      timestamp: Date.now() - 11 * 60 * 1000,
      ephemeralPublicKey: 'pub',
      ephemeralSecretKey: 'sec',
    }
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(stale))

    // First read clears.
    expect(getPendingState()).toBeNull()
    expect(sessionStorage.getItem(PENDING_KEY)).toBeNull()

    // Second read still null — confirms no bring-back-to-life path.
    expect(getPendingState()).toBeNull()
  })

  it('only stores the four expected keys for PendingState (no key-material leakage path)', () => {
    // Round-trip a savePendingState → sessionStorage read and assert
    // the persisted JSON has only the documented keys. A future PR that
    // adds (say) a raw private key field would fail this test.
    const allowed = new Set([
      'walletId',
      'requireSignIn',
      'timestamp',
      'ephemeralPublicKey',
      'ephemeralSecretKey',
      'signInMessage',
    ])
    savePendingState({
      walletId: 'phantom',
      requireSignIn: true,
      timestamp: Date.now(),
      ephemeralPublicKey: 'pub',
      ephemeralSecretKey: 'sec',
      signInMessage: 'hi',
    })

    const raw = sessionStorage.getItem(PENDING_KEY)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string) as Record<string, unknown>
    for (const key of Object.keys(parsed)) {
      expect(allowed.has(key)).toBe(true)
    }
  })
})

// --- 5. RNG sanity ------------------------------------------------------

describe('Security — RNG sanity', () => {
  it('generateEphemeralKeypair produces 32-byte halves with high entropy across calls', () => {
    // Sanity: 100 keypairs, every public key is unique and full-length.
    const seen = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const kp = generateEphemeralKeypair()
      expect(kp.publicKey).toHaveLength(32)
      expect(kp.secretKey).toHaveLength(32)
      const key = bs58.encode(kp.publicKey)
      expect(seen.has(key)).toBe(false)
      seen.add(key)
    }
    expect(seen.size).toBe(100)
  })
})
