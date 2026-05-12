export {
  WalletError,
  WalletNotReadyError,
  WalletLoadError,
  WalletConfigError,
  WalletConnectionError,
  WalletDisconnectedError,
  WalletDisconnectionError,
  WalletAccountError,
  WalletPublicKeyError,
  WalletKeypairError,
  WalletNotConnectedError,
  WalletSendTransactionError,
  WalletSignTransactionError,
  WalletSignMessageError,
  WalletSignInError,
  WalletTimeoutError,
  WalletWindowBlockedError,
  WalletWindowClosedError,
} from './errors'

export { detectPlatform } from './platform/detector'
export type { PlatformInfo, PlatformStrategy } from './platform/detector'

export { WalletReadyState } from './ready-state'

export { asWalletName, type WalletName } from './wallet-name'
