---
---

TASK-702 — npm publish prep. No version-bump changeset because the
bootstrap version (1.0.0) is set manually in each `package.json` — the
next `pnpm changeset version` cycle after the initial publish should
not touch the version on the strength of this PR.

Captured here so the CI changeset-gate (`pnpm changeset status
--since=origin/<base>`) recognizes the package edits as intentional
non-releasing changes.
