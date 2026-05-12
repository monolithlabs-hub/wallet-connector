---
'@monolithlabs/wallet-connect-core': minor
---

TASK-103 — add the SessionStore module to `@monolithlabs/wallet-connect-core`. Exports `PendingState` plus six functions: `createPendingState` (generates a UUID v4 nonce via `crypto.randomUUID()` and a `Date.now()` timestamp), `savePendingState`, `getPendingState` (returns `null` for state older than 10 minutes and clears it as a side effect), `clearPendingState`, `saveLastUsedWallet`, and `getLastUsedWallet`. `PendingState` uses `sessionStorage`; `lastUsedWallet` uses `localStorage`. Both paths fall back to an in-memory slot when the relevant Web Storage API is unavailable (SSR, Safari private browsing, blocked cookies), and every operation is non-throwing. `getSortedWallets` (TASK-102) now reads the last-used wallet via `getLastUsedWallet()` instead of touching `localStorage` directly — single source of truth for the `'lastUsedWallet'` key.
