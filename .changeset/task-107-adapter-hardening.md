---
'@monolithlabs/wallet-connect-core': patch
---

StandardWalletAdapter + discovery hardening (follow-up to TASK-107, in advance of TASK-108 / TASK-109):

- **Discovery filter now requires `standard:events`.** Wallets lacking the events feature pass the old filter but get an adapter whose `subscribe()` never fires — silent contract violation. The tightened filter excludes them, matching upstream's `@solana/wallet-standard-wallet-adapter-base` expectation.
- **`connect()` is single-flight.** Concurrent callers share one `feature.connect()` invocation (no double consent prompts, no account-overwrite races). The inflight slot is cleared after success or failure so retries reach the wallet.
- **`destroy()` disables further use.** An `assertAlive()` guard at the top of `connect` / `disconnect` / `signMessage` / `signIn` / `subscribe` throws `Error("Wallet \"<name>\" adapter has been destroyed")` if called after destroy. `destroy()` itself is idempotent.
- **JSDoc clarifications**:
  - `subscribe`: explicitly documents that listeners fire on transitions only — no initial-state replay. Consumers reading `isConnected` after creating a pre-authorized adapter must check the getter once.
  - `wallet` getter: notes that calls bypassing the adapter (via `wallet.features[...]`) don't update internal state.
  - `signIn`: notes that the returned `output.account` may not yet be in `wallet.accounts` — a spec-compliant wallet emits `change` immediately after to reconcile.
  - `discoverStandardWallets`: notes that each invocation creates a fresh handle / adapter set; for app-wide use, call once and share.

Tests added: filter excludes no-events wallet; concurrent `connect()` runs `feature.connect()` once and emits one `'connect'` event; inflight slot clears on failure so retries work; `connect/disconnect/signMessage/signIn/subscribe` each throw after `destroy()`; `destroy()` is idempotent.
