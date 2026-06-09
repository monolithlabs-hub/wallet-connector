import { describe, it, expect } from 'vitest'

import {
  asWalletName,
  WalletError,
  WalletSignMessageError,
  WalletSignTransactionError,
  WalletNotConnectedError,
  type WalletName,
} from './index'

describe('@monolithlabs-hub/wallet-connect-react test setup', () => {
  it('runs a trivial assertion', () => {
    expect(true).toBe(true)
  })

  it('runs in a jsdom environment', () => {
    expect(typeof window).toBe('object')
    expect(typeof document).toBe('object')
  })
})

describe('wallet-adapter-base replacement surface', () => {
  it('re-exports the error taxonomy as constructable classes', () => {
    expect(WalletError).toBeTypeOf('function')
    expect(WalletSignMessageError).toBeTypeOf('function')
    expect(WalletSignTransactionError).toBeTypeOf('function')
    expect(WalletNotConnectedError).toBeTypeOf('function')
  })

  it('error subclasses extend WalletError', () => {
    expect(new WalletSignMessageError('x')).toBeInstanceOf(WalletError)
    expect(new WalletNotConnectedError('x')).toBeInstanceOf(WalletError)
  })

  it('re-exports asWalletName, which brands a string usable as WalletName', () => {
    expect(asWalletName).toBeTypeOf('function')
    // The typed binding exercises the `WalletName` type re-export — a missing
    // re-export fails `tsc --noEmit` before this runtime assertion runs.
    const name: WalletName = asWalletName('Opindex')
    expect(name).toBe('Opindex')
  })
})
