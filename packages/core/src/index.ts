// All project-specific types come through one canonical barrel.
// See `./types` for the curated re-export set (including the
// `WalletAdapter` union and the `WalletName` branded-string type).
export type * from './types'

// --- Value exports (functions, classes, enums) ----------------------------

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

export {
  extractCallbackFromCurrentUrl,
  isCallbackUrl,
  parseCallback,
} from './adapters/callback-handler'

export {
  buildConnectUrl,
  buildSignAndConnectUrl,
  generateEphemeralKeypair,
} from './adapters/deep-link-builder'

export { createDeepLinkAdapter } from './adapters/deep-link-adapter'

export { createStandardWalletAdapter } from './adapters/standard-wallet-adapter'

export { discoverStandardWallets } from './discovery'

export { detectPlatform } from './platform/detector'

export { WalletReadyState } from './ready-state'

export {
  clearPendingState,
  createPendingState,
  getLastUsedWallet,
  getPendingState,
  saveLastUsedWallet,
  savePendingState,
} from './session/store'

export { createFlowMachine } from './state/machine'

export { createWalletManager } from './wallet-manager'

export { getSortedWallets } from './wallets/sorter'

export { asWalletName } from './wallet-name'
