/**
 * Connection strategy chosen for the current environment.
 *
 * - `extension`: a Solana wallet is injected into `window.solana` — connect via
 *   the Wallet Standard adapter. This also covers mobile in-app browsers
 *   (Phantom, Solflare) since they inject `window.solana` despite the mobile UA.
 * - `deeplink`: mobile browser with no injected wallet — connect via a native
 *   wallet app using its universal-link / deep-link scheme.
 * - `install-prompt`: desktop with no injected wallet — direct the user to
 *   install a supported wallet extension.
 */
export type PlatformStrategy = 'extension' | 'deeplink' | 'install-prompt'

/**
 * Observed state of the current page environment plus the derived
 * connection strategy. Pure read of `navigator.userAgent` and two
 * well-known `window` properties; SSR-safe.
 */
export interface PlatformInfo {
  /** User agent matches `/iPhone|Android|iPad/i`. Equivalent to `isIOS || isAndroid`. */
  isMobile: boolean
  /**
   * User agent matches `/iPad|iPhone|iPod/i`. Used by UI helpers to pick
   * the iOS-native install-button label ("Get" vs Android/desktop "Install").
   */
  isIOS: boolean
  /** User agent matches `/Android/i`. */
  isAndroid: boolean
  /** Any wallet has injected itself as `window.solana`. */
  hasExtension: boolean
  /** The Opindex extension is present (`window.opindex.isOpindex === true`). */
  hasOpindexExtension: boolean
  /** Derived connection strategy; see {@link PlatformStrategy}. */
  strategy: PlatformStrategy
}

declare global {
  interface Window {
    solana?: unknown
    opindex?: { isOpindex?: boolean }
  }
}

const IOS_UA_PATTERN = /iPad|iPhone|iPod/i
const ANDROID_UA_PATTERN = /Android/i

/**
 * Inspect the current environment and return the connection strategy plus
 * the raw signals that produced it.
 *
 * If a wallet is injected at `window.solana`, strategy is always `extension`
 * — even on a mobile UA (Phantom's in-app browser). Falls back to
 * `install-prompt` in SSR and any other unrecognized environment.
 */
export function detectPlatform(): PlatformInfo {
  const hasWindow = typeof window !== 'undefined'
  const hasNavigator = typeof navigator !== 'undefined'

  const ua = hasNavigator ? navigator.userAgent : ''
  const isIOS = IOS_UA_PATTERN.test(ua)
  const isAndroid = ANDROID_UA_PATTERN.test(ua)
  const isMobile = isIOS || isAndroid
  const hasExtension = hasWindow && Boolean(window.solana)
  const hasOpindexExtension = hasWindow && Boolean(window.opindex?.isOpindex)

  const strategy: PlatformStrategy = hasExtension
    ? 'extension'
    : isMobile
      ? 'deeplink'
      : 'install-prompt'

  return { isMobile, isIOS, isAndroid, hasExtension, hasOpindexExtension, strategy }
}
