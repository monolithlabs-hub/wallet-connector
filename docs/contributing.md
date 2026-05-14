# Contributing

This page is for developers adding a new wallet or making changes to the library itself. For dapp consumers, [getting-started.md](./getting-started.md) and [configuration.md](./configuration.md) are the right entry points.

## Repo layout

This is a pnpm + Turborepo monorepo.

```
packages/
  core/   @monolithlabs-hub/wallet-connect-core   — framework-agnostic logic
  ui/     @monolithlabs-hub/wallet-connect-ui     — headless modal/list primitives
  react/  @monolithlabs-hub/wallet-connect-react  — useWallet() + <ConnectButton>
  vue/    @monolithlabs-hub/wallet-connect-vue    — composable + ConnectButton.vue
examples/
  vue-example/                                — Vite + Vue 3 demo app (TASK-602)
docs/                                         — you are here
```

The framework packages re-export the public surface from core; the UI package is a peer of core that the React/Vue packages consume.

## Toolchain

- **Node** ≥ 22.13 (pnpm 11 requires it).
- **pnpm** 11 (pinned via `packageManager` in the root `package.json` — Corepack picks it up automatically).
- **Turborepo** for the cross-package task graph.
- **tsup** for builds (dual ESM + CJS + `.d.ts`).
- **Vitest** with `jsdom` for unit tests.

The familiar commands all run from the repo root:

```bash
pnpm install
pnpm turbo typecheck
pnpm turbo lint
pnpm turbo test
pnpm turbo build
```

Format and verify with `pnpm format` / `pnpm format:check`. Pre-commit runs `lint-staged` so ESLint / Prettier issues block a commit. Commit messages are intentionally NOT enforced — there is no `commit-msg` hook.

## Adding a new wallet

A wallet shows up in the modal when the consumer lists it in `config.wallets`. The library doesn't yet auto-merge Wallet Standard-registered wallets that the consumer didn't list (planned for a future minor); for now, every wallet you want users to see goes into the config array.

If you want to add a new wallet to the library's "recommended" set, the work is:

1. Confirm the wallet implements the Solana Wallet Standard with at least `standard:connect`, `standard:events`, and a `solana:*` chain. If it does, the manager will use the `StandardWalletAdapter` to connect on desktop without further work.
2. Find the wallet's mobile Universal Link API and App Store / Play Store URLs. Add an entry to [docs/wallets.md](./wallets.md) with the `WalletConfig` recipe.
3. If the wallet's deep-link URL format differs from Phantom's (the library's current `DeepLinkBuilder` target), note that in the doc and link to whatever workaround applies. The current builder is in `packages/core/src/adapters/deep-link-builder.ts`.

There is no per-wallet adapter to write. The library has exactly two adapter implementations — `StandardWalletAdapter` (for Wallet Standard wallets on desktop / in-app browsers) and `DeepLinkAdapter` (for the mobile Universal Link flow) — both generic over wallet identity. Adding "support" for a new wallet means writing a config entry and (if mobile differs) extending the deep-link builder.

If a wallet's mobile flow needs a fundamentally different URL contract (e.g., not Phantom-shaped), the right path is to extend `buildConnectUrl` / `buildSignAndConnectUrl` in the deep-link builder rather than writing a parallel adapter. The single-adapter design is intentional — we want to push protocol divergence into one builder, not fan out into N adapters.

## Touching the core

A few load-bearing constraints any change to `packages/core` should respect:

- **`createWalletManager` is the canonical entry point.** New public APIs go on `WalletManager` or `WalletManagerConfig`; don't add side-by-side factories.
- **The FlowMachine is the only state authority.** Don't add ad-hoc booleans on the manager; add `FlowEvent`s and `FlowContext` fields if you need new state.
- **Mobile state must survive a redirect.** Anything new the mobile flow needs to remember goes into `PendingState` in `packages/core/src/session/store.ts`. Persist before navigating, read on `initialize()`.
- **Public types live in `packages/core/src/types.ts`.** That file is a barrel; types are defined in their producer modules. Add a re-export when you add a new type. The slot count in `types.test.ts` is checked by `tsc --noEmit`.
- **No `any` in the public API.** ESLint enforces this. Use `unknown` and narrow at the boundary.

## Tests

Per-package thresholds enforced by Vitest:

- `core`: 90% lines / functions / branches / statements.
- `ui` / `react` / `vue`: 80% each.

The `core` test count is the canonical proxy for "library is healthy" — if you're adding new behavior, target ≥ 5 tests covering the happy path, a rejected/cancelled path, and at least one edge case.

Integration tests for real connect flows live in `packages/core/src/__tests__/integration/`. They use the actual `WalletManager` + `StandardWalletAdapter` stack with a fake Wallet Standard wallet registered into the live registry (no mocks at the manager/adapter level). When you add a new adapter behavior, prefer an integration test over a unit test of the adapter in isolation — it catches the real cross-module interactions.

## Pull request checklist

- `pnpm turbo typecheck lint test build` passes locally.
- For any non-trivial change, add a [Changesets](https://github.com/changesets/changesets) entry: `pnpm changeset`. The packages are linked, so bumping any framework package bumps the others in lockstep.
- If you ported source from `@solana/wallet-adapter-*` (or any Apache-2.0 source), add an attribution header to the file AND a row in `THIRD_PARTY_LICENSES.md`. This isn't optional.
- If you added new public API, document it in [configuration.md](./configuration.md) (or a more specific doc).
- Use task IDs from `.doc/PLAN.md` in commit and PR titles where they apply.

## Where the source is

A quick map for orientation:

- Connect flow: `packages/core/src/wallet-manager.ts`, `state/machine.ts`.
- Mobile flow: `packages/core/src/adapters/deep-link-{builder,adapter}.ts`, `adapters/callback-handler.ts`.
- Desktop flow: `packages/core/src/adapters/standard-wallet-adapter.ts`, `discovery.ts`.
- Wallet sort + pin: `packages/core/src/wallets/sorter.ts`.
- Persisted state: `packages/core/src/session/store.ts`.
- Platform detection: `packages/core/src/platform/detector.ts`.
- React surface: `packages/react/src/`.
- Vue surface: `packages/vue/src/`.
- Headless modal: `packages/ui/src/modal/`.
- Errors: `packages/core/src/errors.ts` (ported from `@solana/wallet-adapter-base`, attribution at top).

## Filing issues

A good bug report includes:

- The wallet name + version (extension or mobile app).
- The platform (browser + OS, or iOS/Android version).
- The `FlowState` you ended up in (read via `useWallet().state` or `manager.getState()`).
- The error message, if any (`useWallet().error` or the `onError` callback).
- A minimal reproduction — ideally a tweak to one of the example apps.

For security issues, do NOT file a public issue. Email security@monolithlabs.com.
