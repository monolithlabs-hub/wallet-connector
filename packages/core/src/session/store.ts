/**
 * Serializable snapshot of an in-progress connect flow, saved before a
 * mobile deep-link redirect so the flow can be resumed when the wallet
 * navigates back to the dApp.
 */
export interface PendingState {
  /** `WalletConfig.id` of the wallet the user tapped. */
  walletId: string
  /** Whether the flow includes a Sign-In With Solana step after connect. */
  requireSignIn: boolean
  /** UUID v4 — single-use nonce that ties this redirect leg to its callback. */
  nonce: string
  /** `Date.now()` at the moment the state was created; used for staleness. */
  timestamp: number
  /** Optional SIWS message the wallet should sign in the same round-trip. */
  signInMessage?: string
}

const PENDING_KEY = '@monolithlabs/wc:pendingState'
const LAST_USED_KEY = 'lastUsedWallet'
const STALE_AFTER_MS = 10 * 60 * 1000

const memory: { pending: string | null; lastUsed: string | null } = {
  pending: null,
  lastUsed: null,
}

/**
 * Build a fresh {@link PendingState} with a UUID v4 nonce and the current
 * timestamp. Call sites should pair this with {@link savePendingState} to
 * persist the result before initiating the redirect.
 */
export function createPendingState(input: {
  walletId: string
  requireSignIn: boolean
  signInMessage?: string
}): PendingState {
  const { walletId, requireSignIn, signInMessage } = input
  const state: PendingState = {
    walletId,
    requireSignIn,
    nonce: crypto.randomUUID(),
    timestamp: Date.now(),
  }
  if (signInMessage !== undefined) state.signInMessage = signInMessage
  return state
}

/**
 * Persist a {@link PendingState} to `sessionStorage`, falling back to an
 * in-memory slot when `sessionStorage` is unavailable (SSR, Safari private
 * browsing, blocked cookies). Returns silently — never throws.
 */
export function savePendingState(state: PendingState): void {
  const json = JSON.stringify(state)
  const s = safeSessionStorage()
  if (s) {
    try {
      s.setItem(PENDING_KEY, json)
      return
    } catch {
      // fall through to in-memory
    }
  }
  memory.pending = json
}

/**
 * Read the last {@link PendingState} persisted by {@link savePendingState}.
 * Returns `null` when no state is present, the state is older than 10
 * minutes (it is cleared as a side-effect), or the stored JSON is corrupt.
 */
export function getPendingState(): PendingState | null {
  let json: string | null = null
  const s = safeSessionStorage()
  if (s) {
    try {
      json = s.getItem(PENDING_KEY)
    } catch {
      return null
    }
  } else {
    json = memory.pending
  }
  if (json === null) return null

  let parsed: PendingState
  try {
    parsed = JSON.parse(json) as PendingState
  } catch {
    return null
  }

  if (Date.now() - parsed.timestamp > STALE_AFTER_MS) {
    clearPendingState()
    return null
  }
  return parsed
}

/**
 * Remove the persisted {@link PendingState} from both `sessionStorage` and
 * the in-memory fallback slot. Safe to call when no state exists.
 */
export function clearPendingState(): void {
  const s = safeSessionStorage()
  if (s) {
    try {
      s.removeItem(PENDING_KEY)
    } catch {
      // ignore
    }
  }
  memory.pending = null
}

/**
 * Remember the wallet the user most recently connected with so the next
 * visit can elevate it in the modal. Persists to `localStorage` with an
 * in-memory fallback when `localStorage` is unavailable.
 */
export function saveLastUsedWallet(walletId: string): void {
  const l = safeLocalStorage()
  if (l) {
    try {
      l.setItem(LAST_USED_KEY, walletId)
      return
    } catch {
      // fall through to in-memory
    }
  }
  memory.lastUsed = walletId
}

/**
 * Read the wallet id remembered by {@link saveLastUsedWallet}, or `null`
 * if none is set. Used by `getSortedWallets` to elevate the last-used
 * wallet to the top of the list.
 */
export function getLastUsedWallet(): string | null {
  const l = safeLocalStorage()
  if (l) {
    try {
      return l.getItem(LAST_USED_KEY)
    } catch {
      return null
    }
  }
  return memory.lastUsed
}

function safeSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === 'undefined') return null
    return sessionStorage
  } catch {
    return null
  }
}

function safeLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}
