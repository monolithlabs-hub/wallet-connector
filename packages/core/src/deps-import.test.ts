import { SolanaSignIn, SolanaSignMessage } from '@solana/wallet-standard-features'
import { getWallets } from '@wallet-standard/app'
import { StandardConnect, StandardDisconnect, StandardEvents } from '@wallet-standard/features'
import { describe, expect, it } from 'vitest'

describe('Wallet Standard spec deps', () => {
  it('exposes a callable getWallets()', () => {
    expect(typeof getWallets).toBe('function')
    const wallets = getWallets()
    expect(typeof wallets.get).toBe('function')
    expect(typeof wallets.on).toBe('function')
  })

  it('exposes the standard:* feature symbol constants as strings', () => {
    expect(typeof StandardConnect).toBe('string')
    expect(typeof StandardDisconnect).toBe('string')
    expect(typeof StandardEvents).toBe('string')
    expect(StandardConnect).toMatch(/^standard:connect$/)
  })

  it('exposes the solana:* feature symbol constants as strings', () => {
    expect(typeof SolanaSignMessage).toBe('string')
    expect(typeof SolanaSignIn).toBe('string')
    expect(SolanaSignMessage).toMatch(/^solana:signMessage$/)
    expect(SolanaSignIn).toMatch(/^solana:signIn$/)
  })
})
