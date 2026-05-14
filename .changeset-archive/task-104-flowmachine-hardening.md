---
'@monolithlabs-hub/wallet-connect-core': patch
---

FlowMachine hardening (follow-up to TASK-104, in advance of TASK-109 wiring it into the `WalletManager`):

- `send()` is now non-re-entrant. A subscriber that calls `machine.send(...)` synchronously during notification throws `FlowMachine.send is not re-entrant — a subscriber called send() during notification`. Previously, a re-entrant call could bypass the transition table during the `WALLET_CONNECTED` → `connected` → `authenticated` auto-step.
- Listener exceptions no longer break dispatch. Each listener call is wrapped; an exception is rethrown asynchronously via `queueMicrotask` (surfacing it to `window.onerror` / Node's unhandled-rejection path) so the auto-step's second `setState` and other listeners still run.
- `createFlowMachine(snapshot)` now runtime-validates `snapshot.state` against the legal `FlowState` set. A tampered or schema-mismatched snapshot falls back to `'idle'` instead of poisoning the machine.
- `getContext()` JSDoc clarified: the returned object is a shallow copy; `context.error`, if present, shares identity with the internally-held error. `send()` JSDoc notes non-re-entrancy.
- `restoreContext` inline-documents the intentional loss of error subclass identity on rehydrate (`instanceof WalletError` survives; `instanceof WalletConnectionError` does not).

Tests added: re-entrancy throw, listener-exception isolation, snapshot-state validation, ERROR-from-error transition, and the previously-missing illegal-transition pairs (`signing/connected + bad event`, all `authenticated + ...` and `error + ...` non-RESET/ERROR pairs).
