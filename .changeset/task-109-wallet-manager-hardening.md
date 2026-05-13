---
'@monolithlabs/wallet-connect-core': patch
---

WalletManager hardening (follow-up to TASK-109, in advance of Phase 2 React/Vue consumers wiring it up):

- **`connect()` auto-resets the FlowMachine when called from a non-idle state.** Previously, a retry after a failed connect (state `'error'`) or re-authenticating with a different wallet (state `'authenticated'`) would crash with "Invalid transition: 'CONNECT_INITIATED' is not allowed from state 'error'" because `CONNECT_INITIATED` only accepts `'idle'`. The auto-RESET makes retry and re-auth Just Work; the consumer no longer has to call `disconnect()` first.
- **`connect()` is single-flight.** Concurrent callers share one in-flight promise. Prevents the second call's auto-RESET from kicking the first call's in-progress flow back to `'idle'`, and matches the single-flight pattern used by the underlying adapters (TASK-107 / TASK-108).
- **`destroy()` disables further use.** An `isDestroyed` flag + `assertAlive()` guards on `connect` / `disconnect` / `initialize` / `subscribe` throw `Error('WalletManager has been destroyed')` after destroy. `destroy()` is idempotent and also unsubscribes the internal `onStateChange` bridge from the FlowMachine.
- **`disconnect()` no longer emits a spurious `onStateChange('idle')` on an already-idle manager.** Gated `machine.send({ type: 'RESET' })` behind `state !== 'idle'`.
- **Consumer-callback exceptions are isolated.** `onError` / `onConnected` / `onAuthenticated` invocations now go through a `safeCallback` helper that wraps in try/catch + `queueMicrotask` rethrow — matches the FlowMachine listener-isolation pattern (TASK-104). A consumer callback that throws no longer poisons the rest of the connect flow or replaces the original `WalletError` in the rethrow path.
- **JSDoc** on `WalletManagerConfig.onStateChange` / `onConnected` clarifies that state-change notifications fire BEFORE the lifecycle callbacks (the FlowMachine's auto-step is synchronous inside `machine.send`). Consumers needing the publicKey at the transition tick should read it from `getContext()` inside `onStateChange`.

Tests added: retry-after-error succeeds; re-auth with a different wallet from `'authenticated'` succeeds; concurrent `connect()` calls share one adapter invocation; `connect` / `disconnect` / `initialize` / `subscribe` all throw after `destroy()`; `destroy()` is idempotent; no spurious `onStateChange('idle')` on never-connected disconnects (desktop AND mobile); a throwing `onConnected` doesn't poison the auth flow; a throwing `onError` doesn't corrupt the rethrown `WalletError`.
