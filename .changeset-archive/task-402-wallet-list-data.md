---
'@monolithlabs-hub/wallet-connect-ui': minor
---

TASK-402 — add the headless wallet-list rendering helpers to `@monolithlabs-hub/wallet-connect-ui`.

Three pure functions consumed by the React and Vue `<ConnectButton>`s (once they migrate). No DOM access, no platform detection, no framework imports — the consumer pre-computes the inputs and the helpers do the mapping.

- **`truncatePublicKey(pubkey, head=4, tail=4)`** — returns `${head chars}…${tail chars}` using a Unicode horizontal ellipsis (U+2026). Inputs shorter than `head + tail` are returned verbatim. Defaults match the React / Vue `<ConnectButton>` connected-state display. Handles `tail=0` correctly (JavaScript's `slice(-0) === slice(0)` returns the whole string, so the implementation explicitly guards).
- **`getInstallBadge({ shouldShow, isIOS })`** — returns `'Get'` on iOS, `'Install'` on Android / desktop, `null` when `shouldShow` is false. Matches the PLAN spec convention (iOS App Store: "Get"; Play Store / Chrome Web Store / Firefox AMO: "Install"). The current React / Vue components show `'Get'` on all mobile (including Android); migrating to this helper will tighten that to iOS-only.
- **`getWalletStatus({ isConnected, isDetected })`** — returns `'connected' | 'available' | 'install'`. `connected` wins over `detected` (both true → `'connected'`); detected without connected → `'available'`; neither → `'install'`.

Both `getInstallBadge` and `getWalletStatus` take pre-computed booleans rather than a `PlatformInfo` or `WalletConfig`, keeping the helpers minimal and avoiding a core-types coupling. The consumer maps from whatever shape they have.

3 test files, 13 cases. 100% function/line coverage on the wallet-list directory.

**Migration note**: The React (TASK-203) and Vue (TASK-303) `<ConnectButton>` components still inline their own truncation/badge logic. The migration onto these helpers + TASK-401's modal primitives is the natural next polish PR — same as called out in the TASK-401 changeset.
