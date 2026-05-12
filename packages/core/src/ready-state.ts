// Portions ported from @solana/wallet-adapter-base (Apache-2.0). See NOTICE.
// Upstream: https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/adapter.ts
//
// Intentional deviation from upstream: this enum is string-valued (the
// upstream is numeric). String values serialize cleanly to JSON, survive
// round-trips through `sessionStorage` (used by `SessionStore`), and are
// self-describing in logs.

export enum WalletReadyState {
  /** A wallet is installed in the user's environment and ready to use. */
  Installed = 'Installed',
  /** A wallet is supported but not currently installed/detected. */
  NotDetected = 'NotDetected',
  /** A wallet is supported but not yet loaded; e.g. a script-injected
   *  wallet that has not finished registering itself. */
  Loadable = 'Loadable',
  /** A wallet is not supported in the current environment (e.g. mobile
   *  browser when only a desktop extension exists). */
  Unsupported = 'Unsupported',
}
