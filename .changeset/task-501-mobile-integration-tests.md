---
'@monolithlabs/wallet-connect-core': patch
---

TASK-501 — integration tests for the full mobile deep-link connect flow.

Adds `packages/core/src/__tests__/integration/mobile-connect-flow.test.ts`. Exercises the **real** WalletManager + DeepLinkAdapter + FlowMachine + SessionStore + CallbackHandler stack with realistic encrypted callback payloads — the wallet side is simulated via `nacl.box` against the dapp's ephemeral public key (read from sessionStorage). The only seams mocked are `navigator.userAgent` (stubbed to iPhone so `detectPlatform` returns the `deeplink` strategy) and `createDeepLinkAdapter`'s `navigate` (so jsdom doesn't try to follow `phantom://` URLs).

Six tests covering the PLAN.md acceptance list:

- **Full round trip** (tap connect → state saved → callback parsed → `onConnected` fired)
- **Full round trip with sign-in** (`requireSignIn: true` → `onAuthenticated` fired with the wallet's signature)
- **`requireSignIn: false` skips signing** — even if the wallet returns a signature in the callback, the dapp's flow stays at `authenticated` via auto-step, not via a sign event
- **Stale pending state (>10 min) is discarded on callback** — SessionStore returns `null` for >10-minute records and clears them on the next read; manager.initialize sees no pending state and bails before touching the callback URL
- **Malformed callback URL handled gracefully** — `parseCallback` returns null on bad data; `resumeFromCallback` clears the pending state (per TASK-108 docs: "so the user can retry instead of getting wedged for the 10-minute staleness window")
- **Opindex App Store redirect fires after 1500ms when not installed** — uses `vi.useFakeTimers()` to advance time past the threshold and asserts the second `navigate` call goes to the App Store URL

Test infrastructure notes:

- `@vitest-environment-options { "url": "https://dapp.example/" }` pragma at the top of the file — jsdom's default `about:blank` has a null origin and rejects all `history.replaceState` calls; the pragma sets a stable HTTPS origin we can mutate within.
- `createDeepLinkAdapter` mocked via `vi.mock` to wrap the real implementation with a `navigate` spy. WalletManager doesn't accept an adapter override directly, so this is the integration-test-friendly seam.
- TextEncoder output wrapped in `new Uint8Array(...)` before passing to `nacl.box` — tweetnacl's strict `instanceof Uint8Array` check rejects the array `TextEncoder.encode()` produces under jsdom realms. Same caveat documented in CLAUDE.md TASK-106.

No source changes — these are purely test additions. Patch bump.
