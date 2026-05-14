---
'@monolithlabs-hub/wallet-connect-core': minor
'@monolithlabs-hub/wallet-connect-ui': minor
'@monolithlabs-hub/wallet-connect-react': minor
'@monolithlabs-hub/wallet-connect-vue': minor
---

TASK-601 / TASK-602 / TASK-603 / TASK-604 / TASK-605 / TASK-606 / TASK-607 / TASK-608 / TASK-609 — Phase 6 wallet-list UX upgrade. Brings the modal to feature parity with `@solana/wallet-adapter-react-ui`.

Four user-facing changes:

1. **Auto-merge of Wallet Standard wallets** (default on, no flag). Any wallet the browser registers with the Wallet Standard registry — Phantom, Solflare, Backpack, Coinbase, Trust, Torus, etc. — is auto-added to the modal list with its name + icon from the spec, even when it isn't in `WalletManagerConfig.wallets`. Consumer's curated list still takes priority and pins; auto-detected ones append at the tail.

2. **"Detected" badge** on every installed wallet, whether configured-and-detected or discovered-only. Replaces the old "no badge" state for installed wallets — matches the de-facto wallet-adapter UX.

3. **CSS variable surface** for theming. Every visual value (`--wc-bg`, `--wc-fg`, `--wc-accent`, `--wc-radius`, `--wc-badge-bg`, `--wc-detected-bg`, …) reads from a custom property with an inline fallback. Set the variables on `:root`, on `[role="dialog"]`, on `[data-wc-modal]`, or on any ancestor. Hover and focus-visible rules are auto-injected via `injectModalStyles()` (idempotent, SSR no-op).

4. **`WalletListEntry[]` return type from `WalletManager.getSortedWallets()`** — breaking. Each entry carries `id`, `name`, `icon`, `priority`, `isDetected`, `source: 'configured' | 'discovered'`, plus the consumer-supplied deep-link fields on configured entries. `useWallet().sortedWallets` and `useWallet().wallet` narrow accordingly in both React and Vue.

Adds:

- `packages/core/src/wallets/list-entry.ts` — `WalletListEntry`, `mergeWalletList(configured, adapters)`, `walletNameSlug(name)`.
- `packages/ui/src/wallet-list/badge.ts` gains `getStatusBadge({status, isIOS})` returning `'Detected' | 'Get' | 'Install' | null`. The narrower `getInstallBadge` remains exported for backward-compat.
- `packages/ui/src/modal/styles.ts` — `injectModalStyles()` + `MODAL_CSS_VARS` typed catalog.
- `WalletManager.connect(walletId)` now resolves discovered-only wallets via slugified `wallet.name` (e.g., `connect('backpack')` works without a matching `WalletConfig` entry).
- `WalletManager.getSortedWallets()` post-processes `isDetected: true` onto the pinned wallet when the legacy `window.opindex` sentinel is set — preserves the existing legacy detection path.
- Initial-letter avatar replaces the gray placeholder square when `wallet.icon` is empty.
- `data-wc-modal`, `data-wc-wallet-item`, `data-wc-modal-close` attributes on the relevant elements for the hover / focus-visible CSS hooks.

Tests:

- `list-entry.test.ts` (16 tests) — merge algorithm, slug rules, dedup by standardName and case-insensitive name, icon fallback, discovered-only entry shape, slug collision defense, no input mutation.
- `discovered-only-connect.test.ts` (5 integration tests) — end-to-end connect to a Wallet Standard wallet not in the config, with case-insensitive name matching and disconnect.
- Badge + status helper coverage expanded.
- Modal styles injection coverage (SSR no-op, idempotency, no default-declaration shadow).
- Three new Playwright desktop specs: discovered-only wallet with "Detected" badge, configured-and-detected Phantom with "Detected" badge, CSS variable override changes the dialog's computed background. Two existing specs renamed from "NO badge" to "Detected badge" to match the new semantics.

Example app (`examples/react-example/src/App.tsx`):

- Drops the `icon: ''` placeholders on Phantom and Solflare — discovery fills them from Wallet Standard.
- Adds `standardName: asWalletName('Phantom' / 'Solflare')` so the merge prefers exact match.
- Keeps a real (inline SVG data-URI) icon for Opindex (Opindex isn't Wallet Standard; discovery can't fill it).

Breaking change scope: the only API change is the return type of `WalletManager.getSortedWallets()` (and the matching narrow in `useWallet().sortedWallets` / `useWallet().wallet`). The input shape `WalletConfig` is unchanged. All four packages are still `private: true` and pre-1.0, so a minor bump is sufficient per `.changeset/config.json`.

Test counts (post-merge): core 372 (was 367; +5 discovered-only integration), ui 65 (+4 status badge, +5 styles), react 61 (+3 detected/discovered renders), vue 51 (+3 detected/discovered renders). Playwright 44 (was 35; +3 specs × 3 desktop projects). Total: 549 vs. 482.
