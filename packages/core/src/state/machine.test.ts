import { describe, expect, it, vi } from 'vitest'

import { WalletConnectionError, WalletError } from '../errors'

import { type FlowEvent, type FlowState, type StateListener, createFlowMachine } from './machine'

function makeMachine() {
  return createFlowMachine()
}

function advanceTo(state: FlowState): ReturnType<typeof createFlowMachine> {
  const m = makeMachine()
  if (state === 'idle') return m
  m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
  if (state === 'connecting') return m
  m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: true })
  if (state === 'connected') return m
  if (state === 'authenticated') {
    m.send({ type: 'SIGN_INITIATED' })
    m.send({ type: 'SIGN_COMPLETED', signature: 'sig' })
    return m
  }
  if (state === 'signing') {
    m.send({ type: 'SIGN_INITIATED' })
    return m
  }
  if (state === 'error') {
    m.send({ type: 'ERROR', error: new WalletConnectionError('boom') })
    return m
  }
  throw new Error(`unreachable: ${state}`)
}

describe('FlowMachine', () => {
  it('starts in idle state', () => {
    expect(makeMachine().getState()).toBe('idle')
  })

  it('idle → connecting on CONNECT_INITIATED', () => {
    const m = makeMachine()
    m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })

    expect(m.getState()).toBe('connecting')
    expect(m.getContext().walletId).toBe('phantom')
  })

  it('connecting → connected on WALLET_CONNECTED (when requireSignIn is true)', () => {
    const m = advanceTo('connecting')
    m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk1', requireSignIn: true })

    expect(m.getState()).toBe('connected')
    expect(m.getContext().publicKey).toBe('pk1')
    expect(m.getContext().requireSignIn).toBe(true)
  })

  it('connected → signing on SIGN_INITIATED', () => {
    const m = advanceTo('connected')
    m.send({ type: 'SIGN_INITIATED' })

    expect(m.getState()).toBe('signing')
  })

  it('connected → authenticated when requireSignIn is false (auto-step from WALLET_CONNECTED)', () => {
    const m = advanceTo('connecting')
    m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: false })

    expect(m.getState()).toBe('authenticated')
  })

  it('signing → authenticated on SIGN_COMPLETED', () => {
    const m = advanceTo('signing')
    m.send({ type: 'SIGN_COMPLETED', signature: 'sig123' })

    expect(m.getState()).toBe('authenticated')
    expect(m.getContext().signature).toBe('sig123')
  })

  it.each<FlowState>(['idle', 'connecting', 'connected', 'signing', 'authenticated'])(
    'any state → error on ERROR (starting from %s)',
    (start) => {
      const m = advanceTo(start)
      const err = new WalletConnectionError('user rejected')
      m.send({ type: 'ERROR', error: err })

      expect(m.getState()).toBe('error')
      expect(m.getContext().error).toBe(err)
    },
  )

  it('error → idle on RESET (and clears context)', () => {
    const m = advanceTo('error')
    expect(m.getContext().error).not.toBeNull()

    m.send({ type: 'RESET' })

    expect(m.getState()).toBe('idle')
    expect(m.getContext()).toEqual({
      walletId: null,
      publicKey: null,
      signature: null,
      requireSignIn: false,
      error: null,
    })
  })

  it.each<{ from: FlowState; event: FlowEvent }>([
    { from: 'idle', event: { type: 'SIGN_INITIATED' } },
    { from: 'idle', event: { type: 'WALLET_CONNECTED', publicKey: 'x', requireSignIn: true } },
    { from: 'idle', event: { type: 'SIGN_COMPLETED', signature: 's' } },
    { from: 'connecting', event: { type: 'CONNECT_INITIATED', walletId: 'p' } },
    { from: 'connecting', event: { type: 'SIGN_INITIATED' } },
    { from: 'connecting', event: { type: 'SIGN_COMPLETED', signature: 's' } },
    { from: 'connected', event: { type: 'CONNECT_INITIATED', walletId: 'p' } },
    { from: 'connected', event: { type: 'SIGN_COMPLETED', signature: 's' } },
    { from: 'connected', event: { type: 'WALLET_CONNECTED', publicKey: 'x', requireSignIn: true } },
    { from: 'signing', event: { type: 'CONNECT_INITIATED', walletId: 'p' } },
    { from: 'signing', event: { type: 'WALLET_CONNECTED', publicKey: 'x', requireSignIn: true } },
    { from: 'signing', event: { type: 'SIGN_INITIATED' } },
    { from: 'authenticated', event: { type: 'CONNECT_INITIATED', walletId: 'p' } },
    {
      from: 'authenticated',
      event: { type: 'WALLET_CONNECTED', publicKey: 'x', requireSignIn: true },
    },
    { from: 'authenticated', event: { type: 'SIGN_INITIATED' } },
    { from: 'authenticated', event: { type: 'SIGN_COMPLETED', signature: 's' } },
    { from: 'error', event: { type: 'CONNECT_INITIATED', walletId: 'p' } },
    { from: 'error', event: { type: 'WALLET_CONNECTED', publicKey: 'x', requireSignIn: true } },
    { from: 'error', event: { type: 'SIGN_INITIATED' } },
    { from: 'error', event: { type: 'SIGN_COMPLETED', signature: 's' } },
  ])('throws on invalid transition: $event.type from $from', ({ from, event }) => {
    const m = advanceTo(from)

    expect(() => m.send(event)).toThrowError(/Invalid transition/)
  })

  it('ERROR from error overwrites context.error and re-notifies', () => {
    const m = advanceTo('error')
    const initialError = m.getContext().error
    const listener = vi.fn<StateListener>()
    m.subscribe(listener)

    const newError = new WalletConnectionError('second failure')
    m.send({ type: 'ERROR', error: newError })

    expect(m.getState()).toBe('error')
    expect(m.getContext().error).toBe(newError)
    expect(m.getContext().error).not.toBe(initialError)
    expect(listener).toHaveBeenCalledWith('error')
  })

  it('serializes and restores state correctly', () => {
    const m = advanceTo('connected')
    const json = JSON.parse(JSON.stringify(m.toJSON())) as ReturnType<typeof m.toJSON>

    const restored = createFlowMachine(json)

    expect(restored.getState()).toBe('connected')
    expect(restored.getContext()).toEqual({
      walletId: 'phantom',
      publicKey: 'pk',
      signature: null,
      requireSignIn: true,
      error: null,
    })
  })

  it('serializes the error state with name and message', () => {
    const m = advanceTo('idle')
    m.send({ type: 'ERROR', error: new WalletConnectionError('rejected by user') })

    const json = m.toJSON()

    expect(json.state).toBe('error')
    expect(json.context.error).toEqual({
      name: 'WalletConnectionError',
      message: 'rejected by user',
    })

    const restored = createFlowMachine(JSON.parse(JSON.stringify(json)) as typeof json)
    expect(restored.getState()).toBe('error')
    const err = restored.getContext().error
    expect(err).toBeInstanceOf(WalletError)
    expect(err?.name).toBe('WalletConnectionError')
    expect(err?.message).toBe('rejected by user')
  })

  it('notifies subscribers on state change', () => {
    const m = makeMachine()
    const listener = vi.fn<StateListener>()
    m.subscribe(listener)

    m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: true })

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 'connecting')
    expect(listener).toHaveBeenNthCalledWith(2, 'connected')
  })

  it('fires two notifications when requireSignIn=false auto-steps through connected', () => {
    const m = advanceTo('connecting')
    const listener = vi.fn<StateListener>()
    m.subscribe(listener)

    m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: false })

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, 'connected')
    expect(listener).toHaveBeenNthCalledWith(2, 'authenticated')
  })

  it('unsubscribed listener is not called', () => {
    const m = makeMachine()
    const listener = vi.fn<StateListener>()
    const unsubscribe = m.subscribe(listener)

    m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    unsubscribe()
    m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: true })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith('connecting')
  })

  it('supports multiple subscribers independently', () => {
    const m = makeMachine()
    const a = vi.fn<StateListener>()
    const b = vi.fn<StateListener>()
    m.subscribe(a)
    const unsubB = m.subscribe(b)

    m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    unsubB()
    m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: true })

    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('getContext returns a shallow copy (primitive mutation isolated)', () => {
    const m = advanceTo('connecting')
    const ctx = m.getContext()
    ctx.walletId = 'mutated'

    expect(m.getContext().walletId).toBe('phantom')
  })

  it('throws when a listener calls send() re-entrantly during dispatch', () => {
    const m = makeMachine()
    let captured: unknown = null
    m.subscribe((state) => {
      if (state === 'connecting') {
        try {
          m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: false })
        } catch (err) {
          captured = err
        }
      }
    })

    m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })

    expect(captured).toBeInstanceOf(Error)
    expect((captured as Error).message).toMatch(/not re-entrant/)
    // Outer send completed normally; state is the outer transition target.
    expect(m.getState()).toBe('connecting')
  })

  it('isolates a throwing listener so other listeners and the auto-step still fire', () => {
    const original = queueMicrotask
    const captured: unknown[] = []
    // Swallow the microtask-rethrown error to keep the test runner clean.
    globalThis.queueMicrotask = (fn) => {
      try {
        fn()
      } catch (err) {
        captured.push(err)
      }
    }
    try {
      const m = advanceTo('connecting')
      const bad = vi.fn<StateListener>((state) => {
        if (state === 'connected') throw new Error('listener exploded')
      })
      const good = vi.fn<StateListener>()
      m.subscribe(bad)
      m.subscribe(good)

      m.send({ type: 'WALLET_CONNECTED', publicKey: 'pk', requireSignIn: false })

      // Auto-step completed despite the throwing listener.
      expect(m.getState()).toBe('authenticated')
      // Good listener was notified for BOTH the 'connected' flash and the 'authenticated' final.
      expect(good).toHaveBeenCalledTimes(2)
      expect(good).toHaveBeenNthCalledWith(1, 'connected')
      expect(good).toHaveBeenNthCalledWith(2, 'authenticated')
      // The thrown error was surfaced via the microtask hook (not swallowed silently).
      expect(captured).toHaveLength(1)
      expect((captured[0] as Error).message).toBe('listener exploded')
    } finally {
      globalThis.queueMicrotask = original
    }
  })

  it('createFlowMachine rejects a tampered snapshot.state and falls back to idle', () => {
    const tampered = {
      state: 'banana' as unknown as ReturnType<
        ReturnType<typeof createFlowMachine>['toJSON']
      >['state'],
      context: {
        walletId: null,
        publicKey: null,
        signature: null,
        requireSignIn: false,
        error: null,
      },
    }

    const m = createFlowMachine(tampered)

    expect(m.getState()).toBe('idle')
    // Sanity: machine still accepts a normal flow after the fallback.
    m.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    expect(m.getState()).toBe('connecting')
  })
})
