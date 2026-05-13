---
'@monolithlabs/wallet-connect-react': minor
---

Phase 2 polish — three follow-up fixes from the holistic review.

**1. Fix the `useWallet().select() + .connect()` stale-closure bug.** `select()` now writes to both `useState` (for re-render) and a synchronous `useRef` (for read-after-write). `connect()` reads the ref, so calling `select(id); await connect()` in the same event handler — the documented wallet-adapter-react migration pattern — actually works. Previously, `connect`'s closure captured the pre-`select` `selectedWalletId` value and threw `WalletConnectionError('No wallet selected')`.

`connect` also gained an optional `walletId` argument: `wallet.connect('phantom')` skips the React state cycle entirely. `<ConnectButton>` now uses this form (and no longer reaches into `useWalletContext()` for the direct-`manager.connect` workaround it previously needed).

**2. Add `signature` to `useWallet`'s return shape.** It was the only `FlowContext` field missing from the hook surface. `<ConnectButton>` previously read it via `useWalletContext().getContext().signature`; it now reads `wallet.signature` directly. Consumers building custom auth UI no longer need to reach for the lower-level hook to display the SIWS signature. Cleared on `RESET` (matches every other context field).

**3. Add a vitest setup file so DOM cleanup is automatic.** `packages/react/vitest.setup.ts` registers `afterEach(cleanup)` once for the whole React package and is wired into `packages/react/vitest.config.ts` via `setupFiles`. `vitest.shared.ts` sets `globals: false`, which had disabled `@testing-library/react`'s auto-cleanup hook — previously, only `connect-button.test.tsx` knew to call `cleanup()` manually. Any future React test using `render()` + `screen.getByRole(...)` is now safe by default.

Side effect: `<ConnectButton>` is now a pure `useWallet()` consumer — no `useWalletContext()` import. The hook is the canonical surface; the context-level escape hatch stays available for advanced consumers but the built-in component doesn't need it.
