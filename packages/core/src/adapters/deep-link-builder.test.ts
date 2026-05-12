import bs58 from 'bs58'
import { describe, expect, it } from 'vitest'

import type { WalletConfig } from '../wallets/sorter'

import {
  type ConnectOptions,
  type EphemeralKeypair,
  buildConnectUrl,
  buildSignAndConnectUrl,
  generateEphemeralKeypair,
} from './deep-link-builder'

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

const solflare: WalletConfig = {
  id: 'solflare',
  name: 'Solflare',
  priority: 2,
  icon: '',
  deepLinkScheme: 'solflare://',
  universalLink: 'https://solflare.com/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const opindex: WalletConfig = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '',
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const fixedKeypair: EphemeralKeypair = {
  // Deterministic 32-byte arrays for predictable assertions.
  publicKey: new Uint8Array(32).fill(0xab),
  secretKey: new Uint8Array(32).fill(0xcd),
}

const baseOptions = (overrides: Partial<ConnectOptions> = {}): ConnectOptions => ({
  redirectUrl: 'https://dapp.example.com/callback',
  appUrl: 'https://dapp.example.com',
  cluster: 'mainnet-beta',
  ephemeralKeypair: fixedKeypair,
  ...overrides,
})

function parseUrl(url: string): { base: string; params: URLSearchParams } {
  const idx = url.indexOf('?')
  return {
    base: url.slice(0, idx),
    params: new URLSearchParams(url.slice(idx + 1)),
  }
}

describe('buildConnectUrl', () => {
  it('builds the correct Phantom connect URL structure', () => {
    const url = buildConnectUrl(phantom, baseOptions())
    const { base, params } = parseUrl(url)

    expect(base).toBe('https://phantom.app/ul/v1/connect')
    expect(params.get('dapp_encryption_public_key')).toBe(bs58.encode(fixedKeypair.publicKey))
    expect(params.get('cluster')).toBe('mainnet-beta')
    expect(params.get('app_url')).toBe('https://dapp.example.com')
    expect(params.get('redirect_link')).toBe('https://dapp.example.com/callback')
  })

  it('builds the correct Solflare connect URL structure', () => {
    const url = buildConnectUrl(solflare, baseOptions({ cluster: 'devnet' }))
    const { base, params } = parseUrl(url)

    expect(base).toBe('https://solflare.com/ul/v1/connect')
    expect(params.get('cluster')).toBe('devnet')
    expect(params.get('dapp_encryption_public_key')).toBeTruthy()
  })

  it('builds the correct Opindex connect URL structure', () => {
    const url = buildConnectUrl(opindex, baseOptions())
    const { base } = parseUrl(url)

    expect(base).toBe('https://opindex.app/ul/v1/connect')
  })

  it('includes redirect_link as a correctly-encoded parameter', () => {
    const redirectUrl = 'https://dapp.example.com/cb?session=abc 123&foo=a/b'
    const url = buildConnectUrl(phantom, baseOptions({ redirectUrl }))

    expect(url).toContain('redirect_link=')
    // The raw URL must not contain the unencoded space.
    expect(url).not.toContain('session=abc 123')
    // URLSearchParams decodes back to the original value when parsed.
    expect(parseUrl(url).params.get('redirect_link')).toBe(redirectUrl)
  })

  it('includes the app_url parameter', () => {
    const url = buildConnectUrl(phantom, baseOptions({ appUrl: 'https://other.example.com' }))

    expect(parseUrl(url).params.get('app_url')).toBe('https://other.example.com')
  })

  it('percent-encodes all special characters in parameter values', () => {
    const url = buildConnectUrl(
      phantom,
      baseOptions({
        redirectUrl: 'https://dapp.example.com/cb?x=1&y=2',
        appUrl: 'https://dapp.example.com/?a=b&c=d',
      }),
    )

    // `&` inside parameter values must be percent-encoded so the wallet
    // parses the outer query string correctly.
    expect(url).toMatch(/redirect_link=https%3A%2F%2Fdapp\.example\.com%2Fcb%3Fx%3D1%26y%3D2/)
    expect(url).toMatch(/app_url=https%3A%2F%2Fdapp\.example\.com%2F%3Fa%3Db%26c%3Dd/)
  })

  it('appends params with `&` when universalLink already has a query string', () => {
    const wallet: WalletConfig = {
      ...phantom,
      universalLink: 'https://phantom.app/ul/v1/connect?v=2',
    }
    const url = buildConnectUrl(wallet, baseOptions())

    expect(url.startsWith('https://phantom.app/ul/v1/connect?v=2&')).toBe(true)
    expect(parseUrl(url).params.get('v')).toBe('2')
    expect(parseUrl(url).params.get('cluster')).toBe('mainnet-beta')
  })

  it('throws on a relative redirectUrl', () => {
    expect(() => buildConnectUrl(phantom, baseOptions({ redirectUrl: '/callback' }))).toThrowError(
      /redirectUrl must be an absolute http\(s\) URL/,
    )
  })

  it('throws on a non-http(s) redirectUrl scheme', () => {
    expect(() =>
      buildConnectUrl(phantom, baseOptions({ redirectUrl: 'javascript:alert(1)' })),
    ).toThrowError(/redirectUrl must use http\(s\)/)
  })

  it('throws on a relative appUrl', () => {
    expect(() =>
      buildConnectUrl(phantom, baseOptions({ appUrl: 'dapp.example.com' })),
    ).toThrowError(/appUrl must be an absolute http\(s\) URL/)
  })

  it('encodes spaces as %20 (not + per form-urlencoded)', () => {
    const url = buildConnectUrl(
      phantom,
      baseOptions({ redirectUrl: 'https://dapp.example.com/cb?session=a%20b c' }),
    )

    expect(url).toContain('%20')
    expect(url).not.toMatch(/redirect_link=[^&]*\+/)
  })

  it('appends params without a duplicated separator when universalLink ends with `?`', () => {
    const wallet: WalletConfig = { ...phantom, universalLink: 'https://phantom.app/ul/v1/connect?' }
    const url = buildConnectUrl(wallet, baseOptions())

    expect(url).not.toContain('?&')
    expect(url.startsWith('https://phantom.app/ul/v1/connect?dapp_encryption_public_key=')).toBe(
      true,
    )
    expect(parseUrl(url).params.get('cluster')).toBe('mainnet-beta')
  })

  it("throws when cluster is not 'mainnet-beta' or 'devnet'", () => {
    expect(() =>
      buildConnectUrl(phantom, baseOptions({ cluster: 'testnet' as unknown as 'devnet' })),
    ).toThrowError(/cluster must be 'mainnet-beta' or 'devnet'/)
  })

  it('throws when ephemeralKeypair.publicKey is the wrong length', () => {
    const shortKey: EphemeralKeypair = {
      publicKey: new Uint8Array(16).fill(0xab),
      secretKey: new Uint8Array(32).fill(0xcd),
    }

    expect(() =>
      buildConnectUrl(phantom, baseOptions({ ephemeralKeypair: shortKey })),
    ).toThrowError(/publicKey must be 32 bytes; got 16/)
  })

  it('never includes the secretKey in the URL (security invariant)', () => {
    const url = buildConnectUrl(phantom, baseOptions())

    expect(url).not.toContain(bs58.encode(fixedKeypair.secretKey))
    // Defense in depth — the raw bytes (hex / b58 / unencoded) should not appear.
    expect(url).not.toContain('cdcdcdcd')
  })
})

describe('buildSignAndConnectUrl', () => {
  it('builds a sign-and-connect URL with the SIWS payload as a query param', () => {
    const url = buildSignAndConnectUrl(phantom, {
      ...baseOptions(),
      signInMessage: 'Sign in to Opindex at 2026-05-12',
    })
    const { params } = parseUrl(url)

    expect(params.get('sign_in_message')).toBe('Sign in to Opindex at 2026-05-12')
    expect(params.get('cluster')).toBe('mainnet-beta')
    expect(params.get('redirect_link')).toBe('https://dapp.example.com/callback')
  })

  it('percent-encodes special characters in the SIWS payload', () => {
    const signInMessage = 'opindex.app wants you to sign in.\nNonce: a&b=c'
    const url = buildSignAndConnectUrl(phantom, { ...baseOptions(), signInMessage })

    expect(url).not.toContain('a&b=c')
    expect(parseUrl(url).params.get('sign_in_message')).toBe(signInMessage)
  })
})

describe('generateEphemeralKeypair', () => {
  it('returns a 32-byte public key and 32-byte secret key', () => {
    const kp = generateEphemeralKeypair()

    expect(kp.publicKey).toBeInstanceOf(Uint8Array)
    expect(kp.publicKey).toHaveLength(32)
    expect(kp.secretKey).toBeInstanceOf(Uint8Array)
    expect(kp.secretKey).toHaveLength(32)
  })

  it('generates a different keypair on each call', () => {
    const a = generateEphemeralKeypair()
    const b = generateEphemeralKeypair()

    expect(a.publicKey).not.toEqual(b.publicKey)
    expect(a.secretKey).not.toEqual(b.secretKey)
  })

  it('produces a public key that base58-encodes to a non-empty string and round-trips', () => {
    const kp = generateEphemeralKeypair()
    const encoded = bs58.encode(kp.publicKey)

    expect(encoded).toMatch(/^[1-9A-HJ-NP-Za-km-z]+$/)
    expect(encoded.length).toBeGreaterThan(20)
    // Round-trip — a bug that mis-encoded the bytes could still produce a
    // valid-charset string, so charset alone isn't enough.
    expect(bs58.decode(encoded)).toEqual(kp.publicKey)
  })
})
