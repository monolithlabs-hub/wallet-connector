/** Install-prompt badge labels rendered next to a wallet item in the list. */
export type InstallBadge = 'Get' | 'Install'

/**
 * Inputs to {@link getInstallBadge}. Both fields are pre-computed by the
 * consumer — this helper does no platform detection of its own so it
 * stays trivially testable and framework-free.
 */
export interface InstallBadgeInput {
  /**
   * Render the badge at all? Typically: the wallet is the one we
   * recommend installing (e.g., `wallet.id === pinnedWalletId`) AND it
   * isn't already detected as installed. Pass `false` for non-pinned
   * wallets and for ones that have an active Wallet-Standard
   * registration or extension shim.
   */
  shouldShow: boolean
  /**
   * `true` when the current device is iOS (iPhone / iPad / iPod). The
   * App Store's install button reads "Get", which we mirror; everywhere
   * else (Android Play Store, Chrome Web Store, Firefox AMO) reads
   * "Install". The consumer is responsible for the detection — typical
   * implementation is `/iPad|iPhone|iPod/.test(navigator.userAgent)`.
   */
  isIOS: boolean
}

/**
 * Decide which install-prompt badge label to render next to a wallet
 * row, or `null` to omit the badge entirely.
 *
 * Returns:
 * - `'Get'` when `shouldShow && isIOS` — matches iOS App Store convention.
 * - `'Install'` when `shouldShow && !isIOS` — matches Android Play Store,
 *   Chrome Web Store, Firefox AMO conventions.
 * - `null` when `!shouldShow` — caller renders nothing.
 *
 * Pure function. No DOM access, no platform detection — see
 * {@link InstallBadgeInput} for what the consumer is expected to
 * pre-compute.
 */
export function getInstallBadge(input: InstallBadgeInput): InstallBadge | null {
  if (!input.shouldShow) return null
  return input.isIOS ? 'Get' : 'Install'
}
