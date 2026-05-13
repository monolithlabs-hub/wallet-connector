---
'@monolithlabs/wallet-connect-core': minor
---

TASK-110 — centralize all project-specific types into `packages/core/src/types.ts`. The new file is a type-only barrel that re-exports from each producer module, giving consumers a single canonical import path:

```ts
import type {
  WalletConfig,
  FlowState,
  WalletManagerConfig,
} from '@monolithlabs/wallet-connect-core'
```

The PLAN.md TASK-110 core list (10 types: `WalletConfig`, `WalletManagerConfig`, `FlowState`, `PlatformInfo`, `PendingState`, `CallbackResult`, `WalletAdapter`, `EphemeralKeypair`, `StateListener`, `Unsubscribe`) plus 24 supporting types (`FlowEvent`, `SerializedFlow`, `SortOptions`, `PlatformStrategy`, `ConnectOptions`, `SignConnectOptions`, `SolanaCluster`, all adapter-event/listener/unsubscribe types, all discovery types, `WalletName`) are now reachable from one place.

**New type**: `WalletAdapter` is defined as `StandardWalletAdapter | DeepLinkAdapter`. The two adapter shapes have intentionally different `connect()` signatures (desktop takes no args; mobile takes input + bundles SIWS), so a single common interface isn't possible. Discriminate at runtime by checking `'wallet' in adapter` (StandardWalletAdapter only) or `'resumeFromCallback' in adapter` (DeepLinkAdapter only). In practice, `WalletManager` (TASK-109) is the canonical consumer and shields downstream code from the union.

**Implementation note**: type definitions stay in their producer modules — `types.ts` is a barrel of `export type` lines, not a relocation. Less invasive (no cross-module circular-import risk), and a missing re-export fails `tsc --noEmit` on the new `types.test.ts` (which imports every required type and uses each in a typed slot).

`index.ts` now uses `export type * from './types'` for all type re-exports; value exports (functions, classes, the `WalletReadyState` enum) remain per-module to preserve direct value imports.

**Tests added**: `types.test.ts` enumerates all 34 re-exported types in a `_Slots` map, runs structural assertions on `FlowState`/`PlatformStrategy`/`SolanaCluster`/`WalletAdapter` shape literals, and verifies the PLAN.md core-list count.

**Phase 1 complete** with this task. The library now has a fully-typed public surface, comprehensive `WalletManager` API, two platform-aware adapters with discovery, FlowMachine state tracking, SessionStore persistence, and all ported error/ready-state primitives — every Phase 1 task from PLAN.md is implemented and hardened.
