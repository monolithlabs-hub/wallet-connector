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
export type { CallbackResult } from './adapters/callback-handler'

export {
  buildConnectUrl,
  buildSignAndConnectUrl,
  generateEphemeralKeypair,
} from './adapters/deep-link-builder'
export type {
  ConnectOptions,
  EphemeralKeypair,
  SignConnectOptions,
  SolanaCluster,
} from './adapters/deep-link-builder'

export { createStandardWalletAdapter } from './adapters/standard-wallet-adapter'
export type {
  StandardAdapterEvent,
  StandardAdapterListener,
  StandardAdapterUnsubscribe,
  StandardWalletAdapter,
} from './adapters/standard-wallet-adapter'

export { discoverStandardWallets } from './discovery'
export type { DiscoveryHandle, DiscoveryListener, DiscoveryUnsubscribe } from './discovery'

export { detectPlatform } from './platform/detector'
export type { PlatformInfo, PlatformStrategy } from './platform/detector'

export { WalletReadyState } from './ready-state'

export {
  clearPendingState,
  createPendingState,
  getLastUsedWallet,
  getPendingState,
  saveLastUsedWallet,
  savePendingState,
} from './session/store'
export type { PendingState } from './session/store'

export { createFlowMachine } from './state/machine'
export type {
  FlowContext,
  FlowEvent,
  FlowMachine,
  FlowState,
  SerializedFlow,
  StateListener,
  Unsubscribe,
} from './state/machine'

export { getSortedWallets } from './wallets/sorter'
export type { WalletConfig } from './wallets/sorter'

export { asWalletName, type WalletName } from './wallet-name'
