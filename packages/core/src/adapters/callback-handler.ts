import bs58 from 'bs58'
import nacl from 'tweetnacl'

import type { EphemeralKeypair } from './deep-link-builder'

/**
 * Successful callback payload after the wallet redirected back and the
 * dapp decrypted the response with its ephemeral secret key.
 *
 * Failed callbacks (user rejection, wallet error) come back with
 * `errorCode`/`errorMessage` query params instead — those are out of scope
 * for TASK-106; this handler returns `null` for them so the caller treats
 * them as "no callback present" and surfaces an error via its own UI.
 */
export interface CallbackResult {
  /** The user's Solana wallet public key (base58). */
  publicKey: string
  /**
   * Opaque session token the wallet expects on subsequent operations
   * (`signMessage`, `disconnect`, etc.). Persist as-is.
   */
  session: string
  /**
   * Optional Ed25519 signature (base58). Present when the redirect was a
   * sign-and-connect or a follow-up sign-message round-trip.
   */
  signature?: string
}

const NACL_NONCE_BYTES = 24
const X25519_KEY_BYTES = 32

/**
 * Cheap structural check: returns `true` if `url` carries the three
 * Phantom-format callback parameters (`phantom_encryption_public_key`,
 * `nonce`, `data`). Does not attempt to decrypt — call {@link parseCallback}
 * after this returns true. Returns `false` on a malformed URL string.
 */
export function isCallbackUrl(url: string): boolean {
  const params = readSearchParams(url)
  if (!params) return false
  return params.has('phantom_encryption_public_key') && params.has('nonce') && params.has('data')
}

/**
 * Decrypt and parse the wallet's encrypted callback payload using the
 * dapp's ephemeral secret key (saved before the redirect). Returns the
 * decoded {@link CallbackResult} on success, or `null` for any kind of
 * malformed input. Never throws.
 *
 * Failure modes that return `null`:
 * - URL is unparseable
 * - one of the three callback params is missing
 * - `phantom_encryption_public_key` / `nonce` / `data` is not valid base58
 * - wallet public key is not 32 bytes
 * - nonce is not 24 bytes
 * - dapp secret key is not 32 bytes
 * - decryption fails (wrong key, tampered ciphertext, wrong nonce)
 * - plaintext is not valid JSON
 * - decrypted JSON is missing or has empty `public_key` / `session`
 * - decrypted JSON's `signature` is present but not a string
 */
export function parseCallback(
  url: string,
  ephemeralKeypair: EphemeralKeypair,
): CallbackResult | null {
  const params = readSearchParams(url)
  if (!params) return null

  const walletPubKeyB58 = params.get('phantom_encryption_public_key')
  const nonceB58 = params.get('nonce')
  const dataB58 = params.get('data')
  if (!walletPubKeyB58 || !nonceB58 || !dataB58) return null

  let walletPubKey: Uint8Array
  let nonce: Uint8Array
  let cipher: Uint8Array
  try {
    walletPubKey = bs58.decode(walletPubKeyB58)
    nonce = bs58.decode(nonceB58)
    cipher = bs58.decode(dataB58)
  } catch {
    return null
  }

  if (walletPubKey.length !== X25519_KEY_BYTES) return null
  if (nonce.length !== NACL_NONCE_BYTES) return null
  if (ephemeralKeypair.secretKey.length !== X25519_KEY_BYTES) return null

  const sharedSecret = nacl.box.before(walletPubKey, ephemeralKeypair.secretKey)
  const decrypted = nacl.box.open.after(cipher, nonce, sharedSecret)
  if (!decrypted) return null

  let payload: unknown
  try {
    payload = JSON.parse(new TextDecoder().decode(decrypted))
  } catch {
    return null
  }

  if (!isPhantomCallbackPayload(payload)) return null

  const result: CallbackResult = {
    publicKey: payload.public_key,
    session: payload.session,
  }
  if (typeof payload.signature === 'string') {
    result.signature = payload.signature
  }
  return result
}

/**
 * Convenience: read `window.location.href`, run {@link parseCallback}, and
 * on success strip the three callback params via `history.replaceState`
 * so a navigation away and back doesn't re-process the same callback.
 *
 * Returns `null` in SSR (no `window`), on a non-callback URL, or on any
 * decode failure. Spec-deviation: PLAN.md's signature is `(): CallbackResult | null`
 * but the dapp's ephemeral secret is required to decrypt — the caller
 * (`WalletManager`) loads it from `SessionStore`-persisted state and
 * passes it in here.
 */
export function extractCallbackFromCurrentUrl(
  ephemeralKeypair: EphemeralKeypair,
): CallbackResult | null {
  if (typeof window === 'undefined') return null
  const href = window.location?.href
  if (typeof href !== 'string' || !isCallbackUrl(href)) return null
  const result = parseCallback(href, ephemeralKeypair)
  if (result !== null) cleanCallbackParams(href)
  return result
}

interface PhantomCallbackPayload {
  public_key: string
  session: string
  signature?: string
}

function isPhantomCallbackPayload(value: unknown): value is PhantomCallbackPayload {
  if (typeof value !== 'object' || value === null) return false
  const obj = value as Record<string, unknown>
  if (typeof obj.public_key !== 'string' || obj.public_key.length === 0) return false
  if (typeof obj.session !== 'string' || obj.session.length === 0) return false
  // `signature` is optional, but if present must be a string. Reject the
  // payload outright (rather than silently dropping the field) so any
  // wire-shape regression surfaces as a `null` parse result.
  if ('signature' in obj && typeof obj.signature !== 'string') return false
  return true
}

function readSearchParams(url: string): URLSearchParams | null {
  try {
    return new URL(url).searchParams
  } catch {
    return null
  }
}

function cleanCallbackParams(href: string): void {
  if (typeof window === 'undefined') return
  if (!window.history?.replaceState) return
  // Strip the URL we actually parsed (not a re-read of `window.location.href`),
  // so a synchronous navigation between parse and clean can't cause us to
  // mutate the wrong entry.
  try {
    const url = new URL(href)
    url.searchParams.delete('phantom_encryption_public_key')
    url.searchParams.delete('nonce')
    url.searchParams.delete('data')
    window.history.replaceState({}, '', url.toString())
  } catch {
    // best-effort; never throw out of a side-effect helper
  }
}
