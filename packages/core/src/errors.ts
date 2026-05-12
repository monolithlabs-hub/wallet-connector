// Portions ported from @solana/wallet-adapter-base (Apache-2.0). See NOTICE.
// Upstream: https://github.com/anza-xyz/wallet-adapter/blob/master/packages/core/base/src/errors.ts
//
// Intentional deviation from upstream: the constructor's `error` field is
// typed as `unknown` instead of `any` to comply with this project's lint
// rules. Runtime behavior is identical.

export class WalletError extends Error {
  error: unknown

  constructor(message?: string, error?: unknown) {
    super(message)
    this.error = error
  }
}

export class WalletNotReadyError extends WalletError {
  override name = 'WalletNotReadyError'
}

export class WalletLoadError extends WalletError {
  override name = 'WalletLoadError'
}

export class WalletConfigError extends WalletError {
  override name = 'WalletConfigError'
}

export class WalletConnectionError extends WalletError {
  override name = 'WalletConnectionError'
}

export class WalletDisconnectedError extends WalletError {
  override name = 'WalletDisconnectedError'
}

export class WalletDisconnectionError extends WalletError {
  override name = 'WalletDisconnectionError'
}

export class WalletAccountError extends WalletError {
  override name = 'WalletAccountError'
}

export class WalletPublicKeyError extends WalletError {
  override name = 'WalletPublicKeyError'
}

export class WalletKeypairError extends WalletError {
  override name = 'WalletKeypairError'
}

export class WalletNotConnectedError extends WalletError {
  override name = 'WalletNotConnectedError'
}

export class WalletSendTransactionError extends WalletError {
  override name = 'WalletSendTransactionError'
}

export class WalletSignTransactionError extends WalletError {
  override name = 'WalletSignTransactionError'
}

export class WalletSignMessageError extends WalletError {
  override name = 'WalletSignMessageError'
}

export class WalletSignInError extends WalletError {
  override name = 'WalletSignInError'
}

export class WalletTimeoutError extends WalletError {
  override name = 'WalletTimeoutError'
}

export class WalletWindowBlockedError extends WalletError {
  override name = 'WalletWindowBlockedError'
}

export class WalletWindowClosedError extends WalletError {
  override name = 'WalletWindowClosedError'
}
