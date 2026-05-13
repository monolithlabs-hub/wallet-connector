/**
 * Display status of a wallet item in the list. The UI typically maps
 * these to a visual state:
 *
 * - `'connected'` — the wallet has an active session right now. Render
 *   a checkmark / connected indicator, hide the "Get"/"Install" badge.
 * - `'available'` — the wallet is installed but not the active one.
 *   Render the row as a normal click-to-connect item.
 * - `'install'` — the wallet isn't installed locally. Render the
 *   "Get"/"Install" badge from {@link getInstallBadge} and link the
 *   row to the platform store on click.
 */
export type WalletStatus = 'connected' | 'available' | 'install'

/**
 * Inputs to {@link getWalletStatus}. Both fields are pre-computed by
 * the consumer — the helper is a pure mapping with no detection logic.
 */
export interface WalletStatusInput {
  /**
   * `true` when this wallet is the one the user is currently connected
   * to. Typically: `manager.getContext().walletId === wallet.id` and
   * the FlowMachine is in a `connected | signing | authenticated` state.
   */
  isConnected: boolean
  /**
   * `true` when the wallet is detected as installed on the user's
   * device. Sources include:
   * - A successful Wallet-Standard registration (desktop / in-app
   *   browser via `discoverStandardWallets`).
   * - A previous successful connect cached in `localStorage`
   *   (`getLastUsedWallet`).
   *
   * For mobile iOS we can NEVER reliably detect installation; pass
   * `false` and let the badge prompt the user to install.
   */
  isDetected: boolean
}

/**
 * Map a wallet's connected / detected state to a display status. Pure
 * function — see {@link WalletStatusInput} for what the consumer must
 * pre-compute.
 *
 * Connected wins over detected. A wallet that's both connected AND
 * detected returns `'connected'` because that's the more specific
 * state.
 */
export function getWalletStatus(input: WalletStatusInput): WalletStatus {
  if (input.isConnected) return 'connected'
  if (input.isDetected) return 'available'
  return 'install'
}
