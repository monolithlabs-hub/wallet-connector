---
---

TASK-704 — Bundle size monitoring. No version-bump changeset because this PR
adds CI tooling, README docs, and per-package `size-limit` config only — no
shipping code changes in any of the four publishable packages.

Captured here so the CI changeset-gate (`pnpm changeset status
--since=origin/<base>`) recognizes the package-json edits (new `size`
script + `size-limit` config block) as intentional non-releasing changes.
