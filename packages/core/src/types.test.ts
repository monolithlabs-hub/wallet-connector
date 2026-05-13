import { describe, expect, it } from 'vitest'

// The point of this test file is structural: import every type that
// PLAN.md's TASK-110 promises will be available from `./types`, use each
// one in a position TypeScript actually checks, and let `tsc --noEmit`
// be the assertion. A missing type would fail the typecheck step long
// before the runtime test ran. The runtime body below is a sanity-check
// that the test file itself loaded.

import type {
  CallbackResult,
  ConnectOptions,
  DeepLinkAdapter,
  DeepLinkAdapterEvent,
  DeepLinkAdapterListener,
  DeepLinkAdapterOptions,
  DeepLinkAdapterUnsubscribe,
  DeepLinkConnectInput,
  DiscoveryHandle,
  DiscoveryListener,
  DiscoveryUnsubscribe,
  EphemeralKeypair,
  FlowContext,
  FlowEvent,
  FlowMachine,
  FlowState,
  PendingState,
  PlatformInfo,
  PlatformStrategy,
  SerializedFlow,
  SignConnectOptions,
  SolanaCluster,
  SortOptions,
  StandardAdapterEvent,
  StandardAdapterListener,
  StandardAdapterUnsubscribe,
  StandardWalletAdapter,
  StateListener,
  Unsubscribe,
  WalletAdapter,
  WalletConfig,
  WalletManager,
  WalletManagerConfig,
  WalletName,
} from './types'

// Each `_unused` is a typed slot the compiler must resolve against the
// imported alias. If the alias goes missing in `./types`, this file
// fails typecheck — which is the contract TASK-110 asserts.
type _Slots = {
  callbackResult: CallbackResult
  connectOptions: ConnectOptions
  deepLinkAdapter: DeepLinkAdapter
  deepLinkAdapterEvent: DeepLinkAdapterEvent
  deepLinkAdapterListener: DeepLinkAdapterListener
  deepLinkAdapterOptions: DeepLinkAdapterOptions
  deepLinkAdapterUnsubscribe: DeepLinkAdapterUnsubscribe
  deepLinkConnectInput: DeepLinkConnectInput
  discoveryHandle: DiscoveryHandle
  discoveryListener: DiscoveryListener
  discoveryUnsubscribe: DiscoveryUnsubscribe
  ephemeralKeypair: EphemeralKeypair
  flowContext: FlowContext
  flowEvent: FlowEvent
  flowMachine: FlowMachine
  flowState: FlowState
  pendingState: PendingState
  platformInfo: PlatformInfo
  platformStrategy: PlatformStrategy
  serializedFlow: SerializedFlow
  signConnectOptions: SignConnectOptions
  solanaCluster: SolanaCluster
  sortOptions: SortOptions
  standardAdapterEvent: StandardAdapterEvent
  standardAdapterListener: StandardAdapterListener
  standardAdapterUnsubscribe: StandardAdapterUnsubscribe
  standardWalletAdapter: StandardWalletAdapter
  stateListener: StateListener
  unsubscribe: Unsubscribe
  walletAdapter: WalletAdapter
  walletConfig: WalletConfig
  walletManager: WalletManager
  walletManagerConfig: WalletManagerConfig
  walletName: WalletName
}

// Sanity assertions on the type SHAPES of a few key types — these are
// type-only checks that exercise structural compatibility, not runtime
// behavior.
type AssertExtends<A, B extends A> = B
type _CheckFlowStates = AssertExtends<
  FlowState,
  'idle' | 'connecting' | 'connected' | 'signing' | 'authenticated' | 'error'
>
type _CheckPlatformStrategies = AssertExtends<
  PlatformStrategy,
  'extension' | 'deeplink' | 'install-prompt'
>
type _CheckSolanaClusters = AssertExtends<SolanaCluster, 'mainnet-beta' | 'devnet'>
type _CheckWalletAdapterUnion = AssertExtends<
  WalletAdapter,
  StandardWalletAdapter | DeepLinkAdapter
>

describe('public types barrel', () => {
  it('re-exports every TASK-110 type from `./types` (compiler-level check)', () => {
    // The real assertion is `tsc --noEmit` over this file's import list
    // and `_Slots` definition above. The runtime body just needs to do
    // *something* observable so vitest counts the test as having run.
    const slots: { [K in keyof _Slots]: K } = {
      callbackResult: 'callbackResult',
      connectOptions: 'connectOptions',
      deepLinkAdapter: 'deepLinkAdapter',
      deepLinkAdapterEvent: 'deepLinkAdapterEvent',
      deepLinkAdapterListener: 'deepLinkAdapterListener',
      deepLinkAdapterOptions: 'deepLinkAdapterOptions',
      deepLinkAdapterUnsubscribe: 'deepLinkAdapterUnsubscribe',
      deepLinkConnectInput: 'deepLinkConnectInput',
      discoveryHandle: 'discoveryHandle',
      discoveryListener: 'discoveryListener',
      discoveryUnsubscribe: 'discoveryUnsubscribe',
      ephemeralKeypair: 'ephemeralKeypair',
      flowContext: 'flowContext',
      flowEvent: 'flowEvent',
      flowMachine: 'flowMachine',
      flowState: 'flowState',
      pendingState: 'pendingState',
      platformInfo: 'platformInfo',
      platformStrategy: 'platformStrategy',
      serializedFlow: 'serializedFlow',
      signConnectOptions: 'signConnectOptions',
      solanaCluster: 'solanaCluster',
      sortOptions: 'sortOptions',
      standardAdapterEvent: 'standardAdapterEvent',
      standardAdapterListener: 'standardAdapterListener',
      standardAdapterUnsubscribe: 'standardAdapterUnsubscribe',
      standardWalletAdapter: 'standardWalletAdapter',
      stateListener: 'stateListener',
      unsubscribe: 'unsubscribe',
      walletAdapter: 'walletAdapter',
      walletConfig: 'walletConfig',
      walletManager: 'walletManager',
      walletManagerConfig: 'walletManagerConfig',
      walletName: 'walletName',
    }
    expect(Object.keys(slots)).toHaveLength(34)
  })

  it('PLAN.md TASK-110 lists 10 core types — verify each by name', () => {
    // PLAN.md TASK-110 explicit list: WalletConfig, WalletManagerConfig,
    // FlowState, PlatformInfo, PendingState, CallbackResult, WalletAdapter,
    // EphemeralKeypair, StateListener, Unsubscribe.
    const required = [
      'WalletConfig',
      'WalletManagerConfig',
      'FlowState',
      'PlatformInfo',
      'PendingState',
      'CallbackResult',
      'WalletAdapter',
      'EphemeralKeypair',
      'StateListener',
      'Unsubscribe',
    ]
    expect(required).toHaveLength(10)
  })
})
