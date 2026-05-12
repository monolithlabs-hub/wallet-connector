// Portions ported from @solana/wallet-adapter-base (Apache-2.0). See NOTICE.
// Upstream: https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/types.ts
//
// A nominal/branded string type that prevents accidentally passing an
// arbitrary string where a wallet identifier is expected. Use the
// `asWalletName()` helper to brand a known string.

declare const __walletNameBrand: unique symbol

export type WalletName<T extends string = string> = T & {
  readonly [__walletNameBrand]: 'WalletName'
}

/** Brand a plain string as a `WalletName`. */
export function asWalletName<T extends string>(name: T): WalletName<T> {
  return name as WalletName<T>
}
