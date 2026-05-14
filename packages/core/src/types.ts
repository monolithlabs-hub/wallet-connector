/**
 * Single source of truth for the project's own public types.
 *
 * Type definitions live in their producer modules (next to the
 * implementation they describe); this file re-exports them so consumers
 * have ONE canonical import path:
 *
 *   import type { WalletConfig, FlowState, WalletManagerConfig } from '@monolithlabs-hub/wallet-connect-core'
 *
 * Conventions:
 * - Project-specific types (defined in this codebase) are re-exported here.
 * - Ported types from `@solana/wallet-adapter-base` — `WalletError` (a
 *   class, exported as a value from `errors.ts`) and `WalletReadyState`
 *   (an enum with a runtime value) — are exported directly from the
 *   package root, not via this barrel, because they have runtime semantics
 *   beyond pure types.
 * - The `WalletName` branded type IS exported here (it's a pure type
 *   alias, even though it was ported), since consumers wanting just the
 *   type signature can use this barrel.
 */

import type { DeepLinkAdapter } from './adapters/deep-link-adapter'
import type { StandardWalletAdapter } from './adapters/standard-wallet-adapter'

// --- Adapter shapes -------------------------------------------------------

export type { CallbackResult } from './adapters/callback-handler'

export type {
  ConnectOptions,
  EphemeralKeypair,
  SignConnectOptions,
  SolanaCluster,
} from './adapters/deep-link-builder'

export type {
  DeepLinkAdapter,
  DeepLinkAdapterEvent,
  DeepLinkAdapterListener,
  DeepLinkAdapterOptions,
  DeepLinkAdapterUnsubscribe,
  DeepLinkConnectInput,
} from './adapters/deep-link-adapter'

export type {
  StandardAdapterEvent,
  StandardAdapterListener,
  StandardAdapterUnsubscribe,
  StandardWalletAdapter,
} from './adapters/standard-wallet-adapter'

/**
 * Union of the two adapter implementations.
 *
 * `StandardWalletAdapter` is used on desktop / in-app browser; its
 * `connect()` takes no arguments and returns a publicKey.
 * `DeepLinkAdapter` is used on mobile; its `connect(input)` takes a
 * `WalletConfig` + flags and never resolves on the current page load
 * (control returns via `resumeFromCallback()` after the redirect).
 *
 * Discriminate at runtime by checking `'wallet' in adapter` — only
 * `StandardWalletAdapter` exposes the underlying Wallet-Standard `.wallet`.
 * Or check `'resumeFromCallback' in adapter` — only `DeepLinkAdapter`
 * has it. In practice, the `WalletManager` (TASK-109) is the canonical
 * consumer; it picks the right adapter via `PlatformDetector.strategy`
 * and shields downstream code from the union entirely.
 */
export type WalletAdapter = StandardWalletAdapter | DeepLinkAdapter

// --- Discovery ------------------------------------------------------------

export type { DiscoveryHandle, DiscoveryListener, DiscoveryUnsubscribe } from './discovery'

// --- Platform / session / state ------------------------------------------

export type { PlatformInfo, PlatformStrategy } from './platform/detector'

export type { PendingState } from './session/store'

export type {
  FlowContext,
  FlowEvent,
  FlowMachine,
  FlowState,
  SerializedFlow,
  StateListener,
  Unsubscribe,
} from './state/machine'

// --- Sorter / WalletManager / WalletConfig -------------------------------

export type { SortOptions, WalletConfig } from './wallets/sorter'

export type { WalletListEntry } from './wallets/list-entry'

export type { WalletManager, WalletManagerConfig } from './wallet-manager'

// --- Ported types (pure type aliases — see file header note) -------------

export type { WalletName } from './wallet-name'

// --- Re-exports from upstream spec packages ------------------------------
// `WalletManager.signIn` accepts/returns these; downstream packages that
// type-annotate against the manager (e.g. the react hook's `signIn` return)
// need to import them. Re-exporting here keeps consumers on one import path
// and avoids requiring them to add `@solana/wallet-standard-features` as a
// direct dependency.

export type { SolanaSignInInput, SolanaSignInOutput } from '@solana/wallet-standard-features'
