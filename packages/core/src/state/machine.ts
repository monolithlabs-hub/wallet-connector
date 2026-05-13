import { WalletError } from '../errors'

/**
 * Discrete states a wallet connect flow can be in. Transitions are driven
 * by {@link FlowEvent}s sent through {@link FlowMachine.send}.
 */
export type FlowState = 'idle' | 'connecting' | 'connected' | 'signing' | 'authenticated' | 'error'

/** Events that cause state transitions. Anything else throws. */
export type FlowEvent =
  | { type: 'CONNECT_INITIATED'; walletId: string }
  | { type: 'WALLET_CONNECTED'; publicKey: string; requireSignIn: boolean }
  | { type: 'SIGN_INITIATED' }
  | { type: 'SIGN_COMPLETED'; signature: string }
  | { type: 'ERROR'; error: WalletError }
  | { type: 'RESET' }

/** Side-band data carried alongside the state. Read via {@link FlowMachine.getContext}. */
export interface FlowContext {
  walletId: string | null
  publicKey: string | null
  signature: string | null
  requireSignIn: boolean
  error: WalletError | null
}

/** Notified by `subscribe` with the new {@link FlowState} after every transition. */
export type StateListener = (state: FlowState) => void
/** Returned by {@link FlowMachine.subscribe}; call to detach the listener. */
export type Unsubscribe = () => void

/** JSON-safe shape produced by {@link FlowMachine.toJSON} and accepted by `createFlowMachine`. */
export interface SerializedFlow {
  state: FlowState
  context: {
    walletId: string | null
    publicKey: string | null
    signature: string | null
    requireSignIn: boolean
    error: { name: string; message: string } | null
  }
}

export interface FlowMachine {
  /** Current state. */
  getState(): FlowState
  /**
   * Shallow snapshot of the current context. The `error` reference, when
   * present, is the same `WalletError` instance held internally — treat it
   * as read-only.
   */
  getContext(): FlowContext
  /**
   * Apply an event; throws on invalid transition. Not re-entrant: calling
   * `send` from inside a listener throws.
   */
  send(event: FlowEvent): void
  /** Observe state changes. Returns an unsubscribe function. */
  subscribe(listener: StateListener): Unsubscribe
  /** Serialize to a JSON-safe snapshot. */
  toJSON(): SerializedFlow
}

const INITIAL_CONTEXT: FlowContext = {
  walletId: null,
  publicKey: null,
  signature: null,
  requireSignIn: false,
  error: null,
}

const VALID_STATES: ReadonlySet<FlowState> = new Set([
  'idle',
  'connecting',
  'connected',
  'signing',
  'authenticated',
  'error',
])

function isValidFlowState(value: unknown): value is FlowState {
  return typeof value === 'string' && VALID_STATES.has(value as FlowState)
}

function isValidSerializedFlow(value: unknown): value is SerializedFlow {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  if (!isValidFlowState(v.state)) return false
  if (typeof v.context !== 'object' || v.context === null) return false
  const ctx = v.context as Record<string, unknown>
  if (ctx.walletId !== null && typeof ctx.walletId !== 'string') return false
  if (ctx.publicKey !== null && typeof ctx.publicKey !== 'string') return false
  if (ctx.signature !== null && typeof ctx.signature !== 'string') return false
  if (typeof ctx.requireSignIn !== 'boolean') return false
  if (ctx.error !== null) {
    if (typeof ctx.error !== 'object') return false
    const e = ctx.error as Record<string, unknown>
    if (typeof e.name !== 'string' || typeof e.message !== 'string') return false
  }
  return true
}

/**
 * Build a {@link FlowMachine}. Pass a {@link SerializedFlow} to restore a
 * snapshot (used to resume a mobile deep-link flow after the wallet
 * redirects back to the dApp).
 *
 * Transition table:
 * - `idle` + `CONNECT_INITIATED` → `connecting`
 * - `connecting` + `WALLET_CONNECTED` → `connected` (then auto-advance to
 *   `authenticated` if `requireSignIn` is `false`)
 * - `connected` + `SIGN_INITIATED` → `signing`
 * - `signing` + `SIGN_COMPLETED` → `authenticated`
 * - any state + `ERROR` → `error`
 * - any state + `RESET` → `idle` (and the context is cleared)
 *
 * Any other (event, state) pair throws a descriptive `Error`.
 */
export function createFlowMachine(snapshot?: SerializedFlow): FlowMachine {
  // If the snapshot's state OR context shape is invalid, fall back to a
  // fresh idle machine. Persisted snapshots are a trust boundary —
  // sessionStorage can be tampered with or carry an older schema.
  const validSnapshot = isValidSerializedFlow(snapshot) ? snapshot : undefined
  let state: FlowState = validSnapshot ? validSnapshot.state : 'idle'
  const context: FlowContext = restoreContext(validSnapshot)
  const listeners = new Set<StateListener>()
  let isSending = false

  const notify = (): void => {
    // Snapshot listeners so a listener detaching itself doesn't perturb iteration.
    // Each listener is isolated: an exception in one is surfaced asynchronously
    // (queueMicrotask → unhandled-rejection / window.onerror) so dispatch can
    // continue and the auto-step's second `setState` still runs.
    for (const listener of [...listeners]) {
      try {
        listener(state)
      } catch (err) {
        queueMicrotask(() => {
          throw err
        })
      }
    }
  }

  const setState = (next: FlowState): void => {
    state = next
    notify()
  }

  const send = (event: FlowEvent): void => {
    if (isSending) {
      throw new Error(
        'FlowMachine.send is not re-entrant — a subscriber called send() during notification',
      )
    }
    isSending = true
    try {
      switch (event.type) {
        case 'CONNECT_INITIATED':
          assertFrom('CONNECT_INITIATED', state, ['idle'])
          context.walletId = event.walletId
          setState('connecting')
          return
        case 'WALLET_CONNECTED':
          assertFrom('WALLET_CONNECTED', state, ['connecting'])
          context.publicKey = event.publicKey
          context.requireSignIn = event.requireSignIn
          setState('connected')
          if (!event.requireSignIn) setState('authenticated')
          return
        case 'SIGN_INITIATED':
          assertFrom('SIGN_INITIATED', state, ['connected'])
          setState('signing')
          return
        case 'SIGN_COMPLETED':
          assertFrom('SIGN_COMPLETED', state, ['signing'])
          context.signature = event.signature
          setState('authenticated')
          return
        case 'ERROR':
          context.error = event.error
          setState('error')
          return
        case 'RESET':
          resetContext(context)
          setState('idle')
          return
        default:
          return assertNever(event)
      }
    } finally {
      isSending = false
    }
  }

  return {
    getState: () => state,
    getContext: () => ({ ...context }),
    send,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    toJSON() {
      return {
        state,
        context: {
          walletId: context.walletId,
          publicKey: context.publicKey,
          signature: context.signature,
          requireSignIn: context.requireSignIn,
          error: context.error
            ? { name: context.error.name, message: context.error.message }
            : null,
        },
      }
    },
  }
}

function assertNever(value: never): never {
  throw new Error(`Unknown event: ${JSON.stringify(value)}`)
}

function assertFrom(eventType: string, current: FlowState, allowed: readonly FlowState[]): void {
  if (!allowed.includes(current)) {
    throw new Error(
      `Invalid transition: '${eventType}' is not allowed from state '${current}' (expected one of: ${allowed.join(', ')})`,
    )
  }
}

function restoreContext(snapshot: SerializedFlow | undefined): FlowContext {
  if (!snapshot) return { ...INITIAL_CONTEXT }
  const { context } = snapshot
  let error: WalletError | null = null
  if (context.error) {
    // Subclass identity is intentionally lost on rehydrate: every restored
    // error is a base `WalletError` with the original `.name` patched in.
    // Callers can still `instanceof WalletError` but NOT `instanceof
    // WalletConnectionError` etc.
    error = new WalletError(context.error.message)
    error.name = context.error.name
  }
  return {
    walletId: context.walletId,
    publicKey: context.publicKey,
    signature: context.signature,
    requireSignIn: context.requireSignIn,
    error,
  }
}

function resetContext(context: FlowContext): void {
  context.walletId = null
  context.publicKey = null
  context.signature = null
  context.requireSignIn = false
  context.error = null
}
