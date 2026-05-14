---
---

TASK-703 — GitHub repository hardening for public contributions. No version-bump
changeset because this PR only adds community-health files
(`CODE_OF_CONDUCT.md`, `.github/PULL_REQUEST_TEMPLATE.md`,
`.github/ISSUE_TEMPLATE/`) and updates `README.md` + `CONTRIBUTING.md` — no
shipping code changes in any of the four publishable packages.

Branch protection on `main` (require PR, require CI to pass, require one
reviewer) is a runtime GitHub setting and is configured outside this PR by a
repository administrator; not represented in the repo.

Captured here so the CI changeset-gate recognizes the changes as intentional
non-releasing tooling/docs work.
