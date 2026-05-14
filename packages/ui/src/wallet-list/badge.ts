/** Install-prompt badge labels rendered next to a wallet item in the list. */
export type InstallBadge = 'Get' | 'Install'

/**
 * Full set of badge labels {@link getStatusBadge} can return. `'Detected'`
 * marks an installed-but-not-active wallet (Wallet Standard registration
 * present, no active session); the install-prompt labels carry their
 * existing meaning from {@link InstallBadge}.
 */
export type StatusBadge = 'Detected' | InstallBadge

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

/** Inputs to {@link getStatusBadge}. */
export interface StatusBadgeInput {
  /** {@link WalletStatus} for this wallet — produced by `getWalletStatus`. */
  status: import('./status').WalletStatus
  /** `true` on iOS — switches the install label from `'Install'` to `'Get'`. */
  isIOS: boolean
}

/**
 * Map a {@link WalletStatus} to a badge label, or `null` when no badge
 * should render for this row.
 *
 * - `'connected'` → `null` (the row already shows a connected indicator).
 * - `'available'` → `'Detected'` (wallet is installed but not active).
 * - `'install'` → `'Get'` on iOS / `'Install'` everywhere else (matches
 *   the App Store / Play Store / Chrome Web Store / Firefox AMO copy).
 *
 * Pure function. Single helper that captures the full badge surface so
 * renderers don't have to switch on `status` themselves. The narrower
 * {@link getInstallBadge} remains exported for backwards-compatibility
 * with callers that already pre-computed `shouldShow`.
 */
export function getStatusBadge(input: StatusBadgeInput): StatusBadge | null {
  if (input.status === 'connected') return null
  if (input.status === 'available') return 'Detected'
  return input.isIOS ? 'Get' : 'Install'
}
