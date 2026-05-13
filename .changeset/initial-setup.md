---
---

Initial Phase 0 monorepo setup (TASK-001 through TASK-007) plus Phase 1 port scaffolding (TASK-100, TASK-110a, TASK-110b). No published artifacts yet — all four `@monolithlabs/wallet-connect-*` packages remain `private: true` until TASK-702 flips them and adds `publishConfig.access: "public"`.

This empty changeset exists because this PR is the first to merge into `main` and creates all workspace packages from scratch; `changeset status` (CI) demands a changeset whenever the diff vs the base branch touches package directories, even if no version bump is intended.
