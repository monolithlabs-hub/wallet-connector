---
'@monolithlabs-hub/wallet-connect-core': patch
---

TASK-502 — integration tests for the full desktop extension connect flow.

Adds `packages/core/src/__tests__/integration/desktop-connect-flow.test.ts`. Exercises the **real** WalletManager + StandardWalletAdapter + FlowMachine + Wallet-Standard discovery stack. The wallet is simulated via a controllable Wallet-Standard `Wallet` object registered with `getWallets()` from `@wallet-standard/app` — the same code path real Phantom / Solflare / Backpack extensions use. No mocks at the manager or adapter level.

Five tests covering the PLAN.md acceptance list:

- **connect → extension popup approved → onConnected fired** — full happy path: connect, FlowMachine transitions through `connecting → connected → authenticated`, `lastUsedWallet` persisted to localStorage.
- **connect → extension popup rejected → onError fired with `WalletConnectionError`** — `standard:connect` feature throws; adapter wraps in `WalletConnectionError`; manager surfaces via `onError`, FlowMachine lands in `error` state.
- **connect + sign (requireSignIn: true) → onAuthenticated fired with the signature** — verifies the SIWS message body is the dapp-provided one with the public key interpolated; signature is base58-encoded by the manager before emission.
- **sign rejected → onError fired with `WalletSignMessageError`** — connect succeeds (`onConnected` fires), then the sign step throws. Manager rejects the connect promise with `WalletSignMessageError`.
- **unexpected disconnect handled gracefully** — establishes a connected session, simulates the wallet emitting `standard:events change` with `accounts: []` (user disconnects from the extension's own UI). Subsequent `manager.signMessage` surfaces a `WalletNotConnectedError` via the adapter's `if (!account) throw` path — pins the design choice that the manager doesn't subscribe to adapter lifecycle events.

Test infrastructure mirrors `mobile-connect-flow.test.ts` patterns where applicable. Wallet stub borrows the structure from `standard-wallet-adapter.test.ts`'s `makeFakeWallet` helper (StandardConnect / StandardDisconnect / SolanaSignMessage / SolanaSignIn / StandardEvents features, an `emitChange` controller for triggering the `change` listener). Wallet registry tracked via the same `trackRegistrations()` pattern used in `discovery.test.ts` so each test starts with a clean registry.

Seams mocked: `navigator.userAgent` (Mac Chrome → `detectPlatform` resolves to `extension`), `window.solana` (truthy sentinel — `detectPlatform` only checks for presence), `localStorage` (real jsdom, cleared between tests).

No source changes — pure test additions. Patch bump (absorbs into the existing core minor bump from prior changesets).

Core test count: 336 (was 331; +5 desktop tests).
