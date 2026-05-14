# Contributing

Thanks for working on `@monolithlabs-hub/wallet-connect`. By participating you agree to abide by the [Code of Conduct](./CODE_OF_CONDUCT.md). Security vulnerabilities should be reported privately — see [`SECURITY.md`](./SECURITY.md).

This document covers the one piece of process that's enforced by CI: **changesets**.

## TL;DR

Any PR that modifies files under `packages/*/**` (the workspace packages) needs a changeset entry. For changes that warrant a release, use:

```sh
pnpm changeset
```

Walk the prompt, select the affected packages, pick a bump type, write a one-line summary. Commit the generated `.changeset/<slug>.md` along with your code.

For changes that touch package files but don't warrant a release — tests-only, internal refactors with no public-API delta, tooling under `packages/` — use an empty changeset to satisfy CI without bumping any package:

```sh
pnpm changeset --empty
```

CI runs `pnpm changeset status` on every PR. If your PR changes files under `packages/*/**` and you forgot a changeset (versioned or empty), CI fails.

## When to add a changeset

| Change touches…                                                                  | Changeset?                                 |
| -------------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/*/src/**` (library code)                                               | **Yes — versioned (`pnpm changeset`)**     |
| `packages/*/tsup.config.ts`, `packages/*/package.json` exports, public API       | **Yes — versioned**                        |
| `packages/*/test/**`, `*.test.ts`, internal types or refactors under `packages/` | **Yes — empty (`pnpm changeset --empty`)** |
| Root tooling (`eslint.config.mjs`, `turbo.json`, `.github/**`, `.husky/**`)      | No                                         |
| `README.md`, `CONTRIBUTING.md`, `.doc/**`, `CLAUDE.md`                           | No                                         |
| `examples/**`                                                                    | No                                         |

When in doubt, add a versioned one — an extra patch bump is cheap.

## Bump types

- **patch** — internal bug fix that doesn't change the public API. Example: fix a race condition in `WalletManager.connect()` without changing its signature.
- **minor** — additive change: a new exported function, a new optional config field, a new optional method on a public class. Existing consumers keep working without changes.
- **major** — breaking change: a removed/renamed export, a required new argument, behavior change that requires consumer updates. Until we cut `1.0.0` we still bump to **minor** for breakings (the `0.x` convention), but please call breakings out in the changeset body so they end up in the changelog.

## Linked packages

`@monolithlabs-hub/wallet-connect-ui`, `@monolithlabs-hub/wallet-connect-react`, and `@monolithlabs-hub/wallet-connect-vue` are configured as a **linked group** in `.changeset/config.json`. Practically:

- Each PR can choose a different bump type per package (e.g., minor for `react`, patch for `vue`, none for `ui`).
- When the release PR is cut, all three packages jump to the same final version (the highest of the three bumps).
- `@monolithlabs-hub/wallet-connect-core` versions **independently** of the framework packages.

## Release flow

1. PRs merge to `main` with changeset files in `.changeset/`.
2. The `release.yml` workflow opens (or updates) a "release: version packages" PR. That PR aggregates all pending changesets, runs `changeset version` to bump versions and rewrite each package's `CHANGELOG.md`, then deletes the consumed changeset files.
3. Merging the release PR triggers `changeset publish`, which publishes to npm with provenance attestations.

All four publishable packages (`core`, `ui`, `react`, `vue`) are at `1.0.0` with `publishConfig.access: "public"` and `publishConfig.provenance: true`. Initial publish is performed manually by a maintainer (`pnpm -r publish` from the repo root); subsequent releases go through the changesets workflow described above.

## Commit messages

There is no commit-message convention enforced on this repo. Pre-commit only runs `lint-staged` (ESLint + Prettier on staged files). Use whatever commit-message style you like — Conventional Commits are fine but not required.

## Local verification

Before pushing:

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm size              # bundle-size check against per-package limits
pnpm changeset status  # confirms your changeset parses
```

CI runs the same steps on Node 24 (see [`.github/workflows/ci.yml`](./.github/workflows/ci.yml)). Bundle-size limits are enforced by a separate `Bundle size` job that also posts a per-package diff against `main` as a PR comment.

## Reporting bugs and requesting features

- **Bug reports** and **feature requests** use the templates at <https://github.com/monolithlabs-hub/wallet-connector/issues/new/choose>.
- **Security vulnerabilities** go through a private channel — see [`SECURITY.md`](./SECURITY.md). Do not file public issues for security reports.
- **Code of conduct** concerns are handled per [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).

## Porting code from upstream

When porting source from `@solana/wallet-adapter` or `@wallet-standard` (both Apache-2.0):

1. Add a file-level attribution header naming the upstream file and the Apache-2.0 license. Existing ports under `packages/core/src/` are reference examples.
2. Add a row to [`THIRD_PARTY_LICENSES.md`](./THIRD_PARTY_LICENSES.md) listing the new file and its upstream path.
3. The PR checklist's "attribution header on any newly-ported file" item must be ticked before merge.
