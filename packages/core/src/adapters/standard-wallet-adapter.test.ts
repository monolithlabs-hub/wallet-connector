import {
  SolanaSignAndSendTransaction,
  SolanaSignIn,
  type SolanaSignInInput,
  type SolanaSignInOutput,
  SolanaSignMessage,
  SolanaSignTransaction,
} from '@solana/wallet-standard-features'
import type { Wallet, WalletAccount } from '@wallet-standard/base'
import {
  StandardConnect,
  StandardDisconnect,
  StandardEvents,
  type StandardEventsListeners,
} from '@wallet-standard/features'
import { describe, expect, it, vi } from 'vitest'

import {
  WalletConnectionError,
  WalletDisconnectionError,
  WalletNotConnectedError,
  WalletNotReadyError,
  WalletSendTransactionError,
  WalletSignInError,
  WalletSignMessageError,
  WalletSignTransactionError,
} from '../errors'

import { createStandardWalletAdapter } from './standard-wallet-adapter'

const PUBKEY_A = '11111111111111111111111111111111'
const PUBKEY_B = 'So11111111111111111111111111111111111111112'

function makeAccount(address: string): WalletAccount {
  return {
    address,
    publicKey: new Uint8Array(32),
    chains: ['solana:mainnet'],
    features: ['solana:signMessage'],
  } as WalletAccount
}

interface FakeWalletControls {
  wallet: Wallet
  emitChange: (props: Parameters<StandardEventsListeners['change']>[0]) => void
  connectSpy: ReturnType<typeof vi.fn>
  signMessageSpy: ReturnType<typeof vi.fn>
  signInSpy: ReturnType<typeof vi.fn>
  signTransactionSpy: ReturnType<typeof vi.fn>
  signAndSendTransactionSpy: ReturnType<typeof vi.fn>
  disconnectSpy: ReturnType<typeof vi.fn>
}

function makeFakeWallet(
  options: {
    name?: string
    initialAccounts?: WalletAccount[]
    withConnect?: boolean
    withDisconnect?: boolean
    withSignMessage?: boolean
    withSignIn?: boolean
    withSignTransaction?: boolean
    withSignAndSendTransaction?: boolean
    withEvents?: boolean
    connectImpl?: () => Promise<{ accounts: readonly WalletAccount[] }>
    signMessageImpl?: () => Promise<readonly { signature: Uint8Array }[]>
    signInImpl?: (input?: SolanaSignInInput) => Promise<readonly SolanaSignInOutput[]>
    signTransactionImpl?: () => Promise<readonly { signedTransaction: Uint8Array }[]>
    signAndSendTransactionImpl?: () => Promise<readonly { signature: Uint8Array }[]>
    disconnectImpl?: () => Promise<void>
  } = {},
): FakeWalletControls {
  const {
    name = 'Fake Wallet',
    initialAccounts = [],
    withConnect = true,
    withDisconnect = true,
    withSignMessage = true,
    withSignIn = false,
    withSignTransaction = false,
    withSignAndSendTransaction = false,
    withEvents = true,
  } = options

  const accounts: WalletAccount[] = [...initialAccounts]
  const changeListeners = new Set<StandardEventsListeners['change']>()

  const connectSpy = vi.fn(
    options.connectImpl ??
      (async () => ({ accounts: accounts.length > 0 ? accounts : [makeAccount(PUBKEY_A)] })),
  )
  const signMessageSpy = vi.fn(
    options.signMessageImpl ?? (async () => [{ signature: new Uint8Array(64).fill(0x11) }]),
  )
  const signInSpy = vi.fn(
    options.signInImpl ??
      (async (input?: SolanaSignInInput) => {
        const account = makeAccount(PUBKEY_A)
        return [
          {
            account,
            signedMessage: new Uint8Array(0),
            signature: new Uint8Array(64).fill(0x22),
            ...(input ?? {}),
          } as SolanaSignInOutput,
        ]
      }),
  )
  const signTransactionSpy = vi.fn(
    options.signTransactionImpl ??
      (async () => [{ signedTransaction: new Uint8Array(8).fill(0x33) }]),
  )
  const signAndSendTransactionSpy = vi.fn(
    options.signAndSendTransactionImpl ??
      (async () => [{ signature: new Uint8Array(64).fill(0x44) }]),
  )
  const disconnectSpy = vi.fn(options.disconnectImpl ?? (async () => undefined))

  const features: Record<string, unknown> = {}
  if (withConnect) {
    features[StandardConnect] = { version: '1.0.0', connect: connectSpy }
  }
  if (withDisconnect) {
    features[StandardDisconnect] = { version: '1.0.0', disconnect: disconnectSpy }
  }
  if (withEvents) {
    features[StandardEvents] = {
      version: '1.0.0',
      on: <E extends keyof StandardEventsListeners>(
        event: E,
        listener: StandardEventsListeners[E],
      ) => {
        if (event !== 'change') return () => {}
        changeListeners.add(listener as StandardEventsListeners['change'])
        return () => {
          changeListeners.delete(listener as StandardEventsListeners['change'])
        }
      },
    }
  }
  if (withSignMessage) {
    features[SolanaSignMessage] = { version: '1.0.0', signMessage: signMessageSpy }
  }
  if (withSignIn) {
    features[SolanaSignIn] = { version: '1.0.0', signIn: signInSpy }
  }
  if (withSignTransaction) {
    features[SolanaSignTransaction] = {
      version: '1.0.0',
      supportedTransactionVersions: ['legacy', 0],
      signTransaction: signTransactionSpy,
    }
  }
  if (withSignAndSendTransaction) {
    features[SolanaSignAndSendTransaction] = {
      version: '1.0.0',
      supportedTransactionVersions: ['legacy', 0],
      signAndSendTransaction: signAndSendTransactionSpy,
    }
  }

  const wallet: Wallet = {
    version: '1.0.0',
    name,
    icon: 'data:image/svg+xml;base64,',
    chains: ['solana:mainnet'],
    features: features as Wallet['features'],
    accounts,
  } as Wallet

  return {
    wallet,
    connectSpy,
    signMessageSpy,
    signInSpy,
    signTransactionSpy,
    signAndSendTransactionSpy,
    disconnectSpy,
    emitChange(props) {
      for (const listener of [...changeListeners]) listener(props)
    },
  }
}

describe('StandardWalletAdapter.connect', () => {
  it('resolves with the first account public key', async () => {
    const { wallet } = makeFakeWallet({
      connectImpl: async () => ({
        accounts: [makeAccount(PUBKEY_A), makeAccount(PUBKEY_B)],
      }),
    })
    const adapter = createStandardWalletAdapter(wallet)

    const result = await adapter.connect()

    expect(result.publicKey).toBe(PUBKEY_A)
    expect(adapter.isConnected).toBe(true)
    expect(adapter.publicKey).toBe(PUBKEY_A)
  })

  it('rejects with WalletConnectionError when the feature throws (user cancel)', async () => {
    const { wallet } = makeFakeWallet({
      connectImpl: async () => {
        throw new Error('user rejected')
      },
    })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.connect()).rejects.toThrow(WalletConnectionError)
    expect(adapter.isConnected).toBe(false)
    expect(adapter.publicKey).toBeNull()
  })

  it('rejects with WalletConnectionError when the wallet returns no accounts', async () => {
    const { wallet } = makeFakeWallet({ connectImpl: async () => ({ accounts: [] }) })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.connect()).rejects.toThrow(WalletConnectionError)
  })

  it('rejects with WalletNotReadyError when standard:connect is missing', async () => {
    const { wallet } = makeFakeWallet({ withConnect: false })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.connect()).rejects.toThrow(WalletNotReadyError)
  })
})

describe('StandardWalletAdapter.signMessage', () => {
  it('returns signature bytes from the first output', async () => {
    const { wallet, signMessageSpy } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      signMessageImpl: async () => [{ signature: new Uint8Array(64).fill(0xaa) }],
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    const signature = await adapter.signMessage(new Uint8Array([1, 2, 3]))

    expect(signature).toEqual(new Uint8Array(64).fill(0xaa))
    expect(signMessageSpy).toHaveBeenCalledOnce()
  })

  it('rejects with WalletSignMessageError on user cancel', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      signMessageImpl: async () => {
        throw new Error('user rejected')
      },
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toThrow(WalletSignMessageError)
  })

  it('rejects with WalletNotConnectedError when no account is selected', async () => {
    const { wallet } = makeFakeWallet()
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toThrow(WalletNotConnectedError)
  })

  it('rejects with WalletNotReadyError when solana:signMessage is missing', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withSignMessage: false,
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toThrow(WalletNotReadyError)
  })
})

describe('StandardWalletAdapter.signIn', () => {
  it('returns SolanaSignInOutput when the feature is present', async () => {
    const { wallet } = makeFakeWallet({ withSignIn: true })
    const adapter = createStandardWalletAdapter(wallet)

    const out = await adapter.signIn({ domain: 'opindex.app' })

    expect(out.account.address).toBe(PUBKEY_A)
    expect(out.signature).toEqual(new Uint8Array(64).fill(0x22))
    // signIn implies connect — the adapter should now be connected.
    expect(adapter.isConnected).toBe(true)
    expect(adapter.publicKey).toBe(PUBKEY_A)
  })

  it('rejects with WalletNotReadyError when solana:signIn is missing', async () => {
    const { wallet } = makeFakeWallet({ withSignIn: false })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.signIn()).rejects.toThrow(WalletNotReadyError)
  })

  it('rejects with WalletSignInError on user cancel', async () => {
    const { wallet } = makeFakeWallet({
      withSignIn: true,
      signInImpl: async () => {
        throw new Error('user rejected')
      },
    })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.signIn()).rejects.toThrow(WalletSignInError)
  })
})

describe('StandardWalletAdapter.signTransaction', () => {
  it('returns the signed transaction bytes from the first output', async () => {
    const { wallet, signTransactionSpy } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withSignTransaction: true,
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    const signed = await adapter.signTransaction(new Uint8Array([9, 9]), 'solana:devnet')

    expect(signed).toEqual(new Uint8Array(8).fill(0x33))
    expect(signTransactionSpy).toHaveBeenCalledOnce()
    expect(signTransactionSpy.mock.calls[0]?.[0]).toMatchObject({ chain: 'solana:devnet' })
  })

  it('rejects with WalletNotConnectedError when no account is selected', async () => {
    const { wallet } = makeFakeWallet({ withSignTransaction: true })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.signTransaction(new Uint8Array([1]))).rejects.toThrow(
      WalletNotConnectedError,
    )
  })

  it('rejects with WalletNotReadyError when solana:signTransaction is missing', async () => {
    const { wallet } = makeFakeWallet({ initialAccounts: [makeAccount(PUBKEY_A)] })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.signTransaction(new Uint8Array([1]))).rejects.toThrow(WalletNotReadyError)
  })

  it('rejects with WalletSignTransactionError on user cancel', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withSignTransaction: true,
      signTransactionImpl: async () => {
        throw new Error('user rejected')
      },
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.signTransaction(new Uint8Array([1]))).rejects.toThrow(
      WalletSignTransactionError,
    )
  })
})

describe('StandardWalletAdapter.signAndSendTransaction', () => {
  it('returns the signature bytes from the first output', async () => {
    const { wallet, signAndSendTransactionSpy } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withSignAndSendTransaction: true,
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    const { signature } = await adapter.signAndSendTransaction(
      new Uint8Array([9, 9]),
      'solana:devnet',
    )

    expect(signature).toEqual(new Uint8Array(64).fill(0x44))
    expect(signAndSendTransactionSpy).toHaveBeenCalledOnce()
    expect(signAndSendTransactionSpy.mock.calls[0]?.[0]).toMatchObject({ chain: 'solana:devnet' })
  })

  it('rejects with WalletNotConnectedError when no account is selected', async () => {
    const { wallet } = makeFakeWallet({ withSignAndSendTransaction: true })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(
      adapter.signAndSendTransaction(new Uint8Array([1]), 'solana:devnet'),
    ).rejects.toThrow(WalletNotConnectedError)
  })

  it('rejects with WalletNotReadyError when the feature is missing', async () => {
    const { wallet } = makeFakeWallet({ initialAccounts: [makeAccount(PUBKEY_A)] })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(
      adapter.signAndSendTransaction(new Uint8Array([1]), 'solana:devnet'),
    ).rejects.toThrow(WalletNotReadyError)
  })

  it('rejects with WalletSendTransactionError on user cancel', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withSignAndSendTransaction: true,
      signAndSendTransactionImpl: async () => {
        throw new Error('user rejected')
      },
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(
      adapter.signAndSendTransaction(new Uint8Array([1]), 'solana:devnet'),
    ).rejects.toThrow(WalletSendTransactionError)
  })
})

describe('StandardWalletAdapter events', () => {
  it("emits 'connect' when the wallet's standard:events fires change with new accounts", () => {
    const { wallet, emitChange } = makeFakeWallet()
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    adapter.subscribe(listener)

    emitChange({ accounts: [makeAccount(PUBKEY_A)] })

    expect(listener).toHaveBeenCalledWith('connect')
    expect(adapter.isConnected).toBe(true)
    expect(adapter.publicKey).toBe(PUBKEY_A)
  })

  it("emits 'accountsChange' when the connected account address changes", () => {
    const { wallet, emitChange } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
    })
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    adapter.subscribe(listener)

    emitChange({ accounts: [makeAccount(PUBKEY_B)] })

    expect(listener).toHaveBeenCalledWith('accountsChange')
    expect(adapter.publicKey).toBe(PUBKEY_B)
  })

  it("emits 'disconnect' when the wallet's accounts list becomes empty", () => {
    const { wallet, emitChange } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
    })
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    adapter.subscribe(listener)

    emitChange({ accounts: [] })

    expect(listener).toHaveBeenCalledWith('disconnect')
    expect(adapter.isConnected).toBe(false)
    expect(adapter.publicKey).toBeNull()
  })

  it('does not fire connect/disconnect on a change event without accounts property', () => {
    const { wallet, emitChange } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
    })
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    adapter.subscribe(listener)

    emitChange({ chains: ['solana:devnet'] })

    expect(listener).not.toHaveBeenCalled()
    expect(adapter.publicKey).toBe(PUBKEY_A)
  })

  it('removes listeners on destroy() and detaches from the wallet', () => {
    const { wallet, emitChange } = makeFakeWallet()
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    adapter.subscribe(listener)

    adapter.destroy()
    emitChange({ accounts: [makeAccount(PUBKEY_A)] })

    expect(listener).not.toHaveBeenCalled()
  })

  it('subscribe returns an unsubscribe function that detaches the listener', () => {
    const { wallet, emitChange } = makeFakeWallet()
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    const unsubscribe = adapter.subscribe(listener)
    unsubscribe()

    emitChange({ accounts: [makeAccount(PUBKEY_A)] })

    expect(listener).not.toHaveBeenCalled()
  })

  it('isolates a throwing listener and continues notifying other listeners', () => {
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
      const { wallet, emitChange } = makeFakeWallet()
      const adapter = createStandardWalletAdapter(wallet)
      const bad = vi.fn(() => {
        throw new Error('listener exploded')
      })
      const good = vi.fn()
      adapter.subscribe(bad)
      adapter.subscribe(good)

      emitChange({ accounts: [makeAccount(PUBKEY_A)] })

      expect(bad).toHaveBeenCalledOnce()
      expect(good).toHaveBeenCalledWith('connect')
      expect(captured).toHaveLength(1)
      expect((captured[0] as Error).message).toBe('listener exploded')
    } finally {
      globalThis.queueMicrotask = original
    }
  })

  it('works correctly on a wallet that does not expose standard:events', async () => {
    const { wallet } = makeFakeWallet({ withEvents: false })
    const adapter = createStandardWalletAdapter(wallet)

    await adapter.connect()
    expect(adapter.isConnected).toBe(true)
    expect(() => adapter.destroy()).not.toThrow()
  })
})

describe('StandardWalletAdapter edge cases', () => {
  it('signMessage rejects with WalletSignMessageError when the wallet returns no outputs', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      signMessageImpl: async () => [],
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toThrow(WalletSignMessageError)
  })

  it('signIn rejects with WalletSignInError when the wallet returns no outputs', async () => {
    const { wallet } = makeFakeWallet({
      withSignIn: true,
      signInImpl: async () => [],
    })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.signIn()).rejects.toThrow(WalletSignInError)
  })

  it('connect() is a no-op when already connected and returns the same publicKey', async () => {
    const { wallet, connectSpy } = makeFakeWallet({ initialAccounts: [makeAccount(PUBKEY_A)] })
    const adapter = createStandardWalletAdapter(wallet)
    const first = await adapter.connect()
    const second = await adapter.connect()

    expect(first.publicKey).toBe(PUBKEY_A)
    expect(second.publicKey).toBe(PUBKEY_A)
    // The wallet's connect() should NOT be called a second time.
    expect(connectSpy).not.toHaveBeenCalled()
  })

  it('concurrent connect() calls share one feature.connect() invocation and one connect event', async () => {
    const { wallet, connectSpy } = makeFakeWallet()
    const adapter = createStandardWalletAdapter(wallet)
    const listener = vi.fn()
    adapter.subscribe(listener)

    const [a, b] = await Promise.all([adapter.connect(), adapter.connect()])

    expect(a.publicKey).toBe(PUBKEY_A)
    expect(b.publicKey).toBe(PUBKEY_A)
    expect(connectSpy).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('connect')
  })

  it('clears inflight slot after a failed connect so a retry can run', async () => {
    let calls = 0
    const { wallet } = makeFakeWallet({
      connectImpl: async () => {
        calls++
        if (calls === 1) throw new Error('first attempt failed')
        return { accounts: [makeAccount(PUBKEY_A)] }
      },
    })
    const adapter = createStandardWalletAdapter(wallet)

    await expect(adapter.connect()).rejects.toThrow(WalletConnectionError)
    // Retry should reach the wallet's connect() again, not get stuck on the cached inflight.
    const second = await adapter.connect()
    expect(second.publicKey).toBe(PUBKEY_A)
    expect(calls).toBe(2)
  })
})

describe('StandardWalletAdapter after destroy()', () => {
  it.each<['connect' | 'disconnect' | 'signMessage' | 'signIn' | 'subscribe']>([
    ['connect'],
    ['disconnect'],
    ['signMessage'],
    ['signIn'],
    ['subscribe'],
  ])('throws when %s is called after destroy()', async (method) => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withSignIn: true,
    })
    const adapter = createStandardWalletAdapter(wallet)
    adapter.destroy()

    if (method === 'connect') {
      await expect(adapter.connect()).rejects.toThrow(/has been destroyed/)
    } else if (method === 'disconnect') {
      await expect(adapter.disconnect()).rejects.toThrow(/has been destroyed/)
    } else if (method === 'signMessage') {
      await expect(adapter.signMessage(new Uint8Array([1]))).rejects.toThrow(/has been destroyed/)
    } else if (method === 'signIn') {
      await expect(adapter.signIn()).rejects.toThrow(/has been destroyed/)
    } else {
      expect(() => adapter.subscribe(() => {})).toThrow(/has been destroyed/)
    }
  })

  it('destroy() is idempotent', () => {
    const { wallet } = makeFakeWallet()
    const adapter = createStandardWalletAdapter(wallet)

    expect(() => {
      adapter.destroy()
      adapter.destroy()
    }).not.toThrow()
  })
})

describe('StandardWalletAdapter.disconnect', () => {
  it('calls standard:disconnect when available and emits disconnect', async () => {
    const { wallet, disconnectSpy } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()
    const listener = vi.fn()
    adapter.subscribe(listener)

    await adapter.disconnect()

    expect(disconnectSpy).toHaveBeenCalledOnce()
    expect(listener).toHaveBeenCalledWith('disconnect')
    expect(adapter.isConnected).toBe(false)
  })

  it('still clears local state when the wallet does not implement standard:disconnect', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      withDisconnect: false,
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.disconnect()).resolves.toBeUndefined()
    expect(adapter.isConnected).toBe(false)
    expect(adapter.publicKey).toBeNull()
  })

  it('rejects with WalletDisconnectionError when the wallet throws', async () => {
    const { wallet } = makeFakeWallet({
      initialAccounts: [makeAccount(PUBKEY_A)],
      disconnectImpl: async () => {
        throw new Error('cleanup failed')
      },
    })
    const adapter = createStandardWalletAdapter(wallet)
    await adapter.connect()

    await expect(adapter.disconnect()).rejects.toThrow(WalletDisconnectionError)
  })
})
