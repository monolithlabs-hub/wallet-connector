---
'@monolithlabs/wallet-connect-core': minor
---

TASK-101 — add `detectPlatform()` to `@monolithlabs/wallet-connect-core`. Inspects `navigator.userAgent` plus `window.solana` / `window.opindex` and returns a `PlatformInfo` whose `strategy` is one of `'extension' | 'deeplink' | 'install-prompt'`. SSR-safe (returns `install-prompt` with all booleans `false` when `window`/`navigator` are absent). A mobile UA with `window.solana` present resolves to `'extension'` so Phantom's in-app browser keeps working.
