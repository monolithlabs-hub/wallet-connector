import { describe, expect, it } from 'vitest'

import { asWalletName, type WalletName } from './wallet-name'

describe('WalletName', () => {
  it('preserves the underlying string value', () => {
    const name = asWalletName('Phantom')
    expect(name).toBe('Phantom')
  })

  it('round-trips through string operations', () => {
    const name = asWalletName('Solflare')
    expect(name.toLowerCase()).toBe('solflare')
  })

  it('asWalletName narrows the literal type', () => {
    const name: WalletName<'Backpack'> = asWalletName('Backpack')
    expect(name).toBe('Backpack')
  })
})
