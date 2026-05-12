---
'@monolithlabs/wallet-connect-core': patch
---

CallbackHandler hardening (follow-up to TASK-106, in advance of TASK-108 consuming the module):

- `isPhantomCallbackPayload` now rejects empty-string `public_key` / `session` (a tampered or hostile redirect could previously slip through as `{ publicKey: '', session: '' }` and leak into TASK-109's `onConnected('')` callback). Also rejects payloads whose `signature` field is present but not a string — previously silently dropped, now consistent with the "all shape errors → null" pattern used elsewhere.
- `cleanCallbackParams` now takes the URL we actually parsed instead of re-reading `window.location.href`. Removes a theoretical race where a synchronous navigation between parse and clean would mutate the wrong history entry. Also drops the unreachable `errorCode` / `errorMessage` keys from the delete list — they can never be present on the success path (error redirects fail `isCallbackUrl` earlier).
- `parseCallback` JSDoc enumerates every failure mode that returns `null`.

Tests added: empty-string `public_key`; empty-string `session`; non-string `signature`; absent `signature` produces a result without the `signature` property (regression check on the type guard refactor).
