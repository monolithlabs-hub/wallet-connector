/**
 * Truncate a base58 public key (or any string) for display.
 *
 * Returns `${head chars}…${tail chars}` joined with a Unicode horizontal
 * ellipsis (`…`, U+2026 — NOT three ASCII dots). Inputs shorter than
 * `head + tail` characters are returned verbatim with no truncation
 * applied (so `truncatePublicKey('abc')` returns `'abc'`).
 *
 * Defaults to 4 + 4 — chosen to match the visual style of the React /
 * Vue `<ConnectButton>` components and the Phantom / Solflare native
 * connected-state UIs.
 *
 * Negative `head` / `tail` values are clamped to 0; the function never
 * produces garbled output from nonsensical inputs.
 *
 * @remarks
 * Operates on UTF-16 code units, not grapheme clusters. Surrogate pairs
 * may split at a boundary if `head` or `tail` lands inside a pair —
 * irrelevant for base58 input (no surrogate pairs), worth knowing if
 * you reuse this helper for arbitrary user-facing strings.
 *
 * @example
 * ```ts
 * truncatePublicKey('ABCD1234567890XYZW')        // 'ABCD…XYZW'
 * truncatePublicKey('ABCD1234567890XYZW', 2, 2)  // 'AB…ZW'
 * truncatePublicKey('SHORT')                      // 'SHORT' (≤ 8 chars)
 * ```
 *
 * @param pubkey - The string to truncate.
 * @param head - Number of leading characters to keep. Default `4`. Clamped to 0 if negative.
 * @param tail - Number of trailing characters to keep. Default `4`. Clamped to 0 if negative.
 */
export function truncatePublicKey(pubkey: string, head = 4, tail = 4): string {
  // Clamp negatives — `slice(0, -1)` would interpret `-1` as
  // "all but the last char", producing weird output for a "keep N chars
  // at the start" param. Easier to clamp than to document degenerate
  // behavior.
  const safeHead = Math.max(0, head)
  const safeTail = Math.max(0, tail)
  if (pubkey.length <= safeHead + safeTail) return pubkey
  // `pubkey.slice(-0)` returns the full string because `-0 === 0` in JS
  // — guard explicitly so a 0-length tail produces an empty string.
  const tailStr = safeTail > 0 ? pubkey.slice(-safeTail) : ''
  return `${pubkey.slice(0, safeHead)}…${tailStr}`
}
