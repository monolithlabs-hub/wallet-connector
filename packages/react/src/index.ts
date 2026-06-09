export { ConnectButton, type ConnectButtonProps } from './components/connect-button'
export { useWalletContext } from './context/use-wallet-context'
export {
  WalletConnectProvider,
  type WalletConnectProviderProps,
} from './context/wallet-connect-provider'
export { useWallet, type UseWalletReturn } from './hooks/use-wallet'

// wallet-adapter-base replacement surface — re-exported from core so consumers
// migrating off @solana/wallet-adapter-{react,base} import everything from one
// place. The conversion shim (PublicKey / object-based signTransaction) stays in
// the consuming app; this package remains @solana/web3.js-free.
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
  asWalletName,
  type WalletName,
} from '@monolithlabs-hub/wallet-connect-core'
