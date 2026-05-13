---
'@monolithlabs/wallet-connect-react': minor
'@monolithlabs/wallet-connect-vue': minor
'@monolithlabs/wallet-connect-core': minor
'@monolithlabs/wallet-connect-ui': patch
---

Phase 4 follow-up — migrate the React and Vue `<ConnectButton>`s onto the headless `wallet-connect-ui` primitives.

**`@monolithlabs/wallet-connect-core`** (minor):

- `PlatformInfo` gains `isIOS: boolean` and `isAndroid: boolean`. `detectPlatform()` parses `navigator.userAgent` for both. `isMobile` is now equivalent to `isIOS || isAndroid` (semantics unchanged; just derives from the more granular flags). Test fixtures across the workspace updated.

**`@monolithlabs/wallet-connect-react`** (minor):

- `<ConnectButton>`'s `WalletModal` no longer inlines focus trap / initial focus / focus restoration / Escape handling. All four are delegated to `attachModal` from `@monolithlabs/wallet-connect-ui`. **Body scroll lock is now applied while the modal is open** — was missing in the prior implementation.
- Modal ARIA attributes (`role`, `aria-modal`, `aria-labelledby`) come from `getDialogAttributes(titleId)`.
- Public-key truncation in the connected-state label uses `truncatePublicKey` from ui.
- Install-badge logic uses `getInstallBadge({ shouldShow, isIOS: platform.isIOS })`. **Android now correctly shows "Install" instead of "Get"** — PLAN-spec parity; iOS keeps "Get".
- ~80 lines of inlined logic removed; the component delegates lifecycle to the headless package and keeps only the JSX shape + inline styling.

**`@monolithlabs/wallet-connect-vue`** (minor):

- Same migration as React. `<ConnectButton.vue>`'s `watch(open)` now calls `attachModal` instead of running an inline focus trap + keydown listener.
- Same Android-badge fix.
- Same scroll-lock addition.

**`@monolithlabs/wallet-connect-ui`** (patch):

- Dropped the unused `@monolithlabs/wallet-connect-core` `dependencies` entry. The Phase 4 helpers take pre-computed primitives; no core types are imported. (The core dep will return naturally if a future convenience layer accepts `WalletConfig` directly.)

**Behavior changes** (consumer-visible):

- Android opens to the wallet modal: Opindex's badge now reads "Install" instead of "Get". Matches the Play Store install button.
- Both React and Vue modals lock body scroll while open. Mobile + desktop.
- Focus-trap selector is the tightened ARIA list (now includes `iframe`, `details > summary`, `[contenteditable]`, `audio/video [controls]` per TASK-401 polish — both components inherit for free).

**Test fixtures** updated across `core/platform/detector.test.ts`, `core/wallets/sorter.test.ts`, `core/wallet-manager.test.ts`, `react/.../connect-button.test.tsx`, `vue/.../ConnectButton.test.ts` to include the new `isIOS` / `isAndroid` fields. No test logic changes — the mobile fixtures default to `isIOS: true, isAndroid: false` to preserve the existing "Get on mobile" expectation in those tests.
