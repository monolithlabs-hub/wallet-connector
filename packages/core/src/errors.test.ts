import { describe, expect, it } from 'vitest'

import {
  WalletAccountError,
  WalletConfigError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletError,
  WalletKeypairError,
  WalletLoadError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletPublicKeyError,
  WalletSendTransactionError,
  WalletSignInError,
  WalletSignMessageError,
  WalletSignTransactionError,
  WalletTimeoutError,
  WalletWindowBlockedError,
  WalletWindowClosedError,
} from './errors'

const subclasses = [
  ['WalletNotReadyError', WalletNotReadyError],
  ['WalletLoadError', WalletLoadError],
  ['WalletConfigError', WalletConfigError],
  ['WalletConnectionError', WalletConnectionError],
  ['WalletDisconnectedError', WalletDisconnectedError],
  ['WalletDisconnectionError', WalletDisconnectionError],
  ['WalletAccountError', WalletAccountError],
  ['WalletPublicKeyError', WalletPublicKeyError],
  ['WalletKeypairError', WalletKeypairError],
  ['WalletNotConnectedError', WalletNotConnectedError],
  ['WalletSendTransactionError', WalletSendTransactionError],
  ['WalletSignTransactionError', WalletSignTransactionError],
  ['WalletSignMessageError', WalletSignMessageError],
  ['WalletSignInError', WalletSignInError],
  ['WalletTimeoutError', WalletTimeoutError],
  ['WalletWindowBlockedError', WalletWindowBlockedError],
  ['WalletWindowClosedError', WalletWindowClosedError],
] as const

describe('WalletError', () => {
  it('extends Error', () => {
    const e = new WalletError('boom')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(WalletError)
    expect(e.message).toBe('boom')
  })

  it('preserves the cause as `error`', () => {
    const cause = { reason: 'rejected' }
    const e = new WalletError('msg', cause)
    expect(e.error).toBe(cause)
  })

  it('accepts no arguments', () => {
    const e = new WalletError()
    expect(e.message).toBe('')
    expect(e.error).toBeUndefined()
  })
})

describe.each(subclasses)('%s', (expectedName, Cls) => {
  it('extends WalletError and Error', () => {
    const e = new Cls('msg')
    expect(e).toBeInstanceOf(Cls)
    expect(e).toBeInstanceOf(WalletError)
    expect(e).toBeInstanceOf(Error)
  })

  it(`has name === '${expectedName}'`, () => {
    expect(new Cls().name).toBe(expectedName)
  })

  it('preserves message and cause', () => {
    const cause = new Error('inner')
    const e = new Cls('outer', cause)
    expect(e.message).toBe('outer')
    expect(e.error).toBe(cause)
  })
})
