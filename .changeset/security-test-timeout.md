---
---

Test-only change in `@monolithlabs-hub/wallet-connect-core`: bump the per-test
timeout on `handles larger-than-expected base58 data without throwing` to 30s
and collapse the duplicate `parseCallback` call into a single invocation. The
test was timing out at the 5s default on slower CI runners due to bs58's
intentionally-O(n²) decode of a 4KB random payload — same audit-accepted
behavior documented in TASK-701. No production code or public-API changes.

Empty changeset (no version bumps) so the CI changeset-gate (`pnpm changeset
status --since=origin/<base>`) recognizes the test edit as intentional.
