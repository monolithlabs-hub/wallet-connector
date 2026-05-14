---
'@monolithlabs-hub/wallet-connect-core': patch
---

TASK-701 — Security audit of the deep-link / callback / session-storage stack, plus the addition of a vulnerability disclosure policy.

**No source code changes.** The audit reviewed the four areas called out in TASK-701 and found the existing implementations already meet the acceptance criteria:

- **Ephemeral keypair generation** uses `nacl.box.keyPair()` (CSPRNG via `crypto.getRandomValues`) — no `Math.random` anywhere in production source.
- **Deep-link URL construction** validates absolute http(s) URLs (rejects `javascript:`, `data:`, `file:`, protocol-relative), whitelists the cluster, enforces 32-byte keys, and percent-encodes every parameter.
- **Callback parsing** is total — every failure mode (unparseable URL, missing params, base58 decode failure, wrong key/nonce sizes, decryption failure, invalid JSON, schema mismatch) returns `null` and never throws. URL cleanup runs only on successful parse.
- **Session storage** holds only the necessary fields (single-use ephemeral keypair, walletId, signInMessage, timestamp) under `sessionStorage` (per-tab, cleared on tab close), with a 10-minute TTL and shape validation on read. The secret key is cleared promptly on success, parse failure, and `disconnect`.

**Additions:**

- Repo-root `SECURITY.md` documenting GitHub Security Advisories as the disclosure channel, scope (in/out), response timeline, and coordinated disclosure expectations.
- `packages/core/src/__tests__/security/security.test.ts` — a centralized security-themed test suite (~25 cases) covering: scheme injection (`javascript:`/`data:`/`file:`/protocol-relative), CRLF / `&=` / NUL-byte encoding in URL parameters, prototype pollution attempts via `__proto__` and `constructor.prototype` in decrypted JSON and persisted session state, oversized base58 input handling, MAC mismatch on tampered nonce, URL-cleanup invariants (preserves non-callback params on success; leaves URL untouched on failure), session-storage schema-tampering defenses, future-timestamp behavior, the persisted-keys allowlist, and a repo-wide `Math.random` regression guard.

Test-only addition; no public API or runtime behavior changes.
