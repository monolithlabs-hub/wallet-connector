---
'@monolithlabs-hub/wallet-connect-react': minor
---

TASK-203 — add `<ConnectButton>` to `@monolithlabs-hub/wallet-connect-react`.

A ready-to-use button that runs the full wallet connect flow. Disconnected: shows a configurable label (default `"Connect Wallet"`) and opens a modal with the sorted wallet list. Connected: shows a truncated public key (`ABCD…WXYZ`) and opens a "connected" view with a Disconnect action. The pinned wallet (Opindex) carries a "Get" badge on mobile (iOS can't probe for installed apps) and an "Install" badge on desktop without the Opindex extension detected; no badge on desktop with the extension.

Props (per PLAN.md spec): `label`, `connectedLabel`, `className`, `style`, `onConnected(publicKey)`, `onAuthenticated(publicKey, signature)`. The lifecycle callbacks fire on the FlowMachine's connected / authenticated transitions and are additive to the manager-level callbacks (consumers can use either or both).

**Accessibility**: the modal is `role="dialog"`, `aria-modal="true"`, `aria-labelledby` linked to the heading. Focus moves to the first focusable element on open (the Close button). Tab/Shift+Tab cycles focus within the modal. Escape closes. Clicking the backdrop closes; clicks on the dialog interior do not.

**Implementation note**: this is the first React component, and TASK-401/402 (the headless `@monolithlabs-hub/wallet-connect-ui` package) haven't shipped yet. The modal shell, focus-trap, and wallet-list-item are inline in `connect-button.tsx` and will be extracted into the UI package when it lands; consumers won't notice the swap.

**Stale-closure footnote**: `ConnectButton` uses `manager.connect(walletId)` from `useWalletContext()` rather than `useWallet().select(id); useWallet().connect()`. The latter has a real bug — `wallet.connect` closes over the pre-`select` value of `selectedWalletId` in the same event handler. This is a known follow-up on the TASK-201 hook.

**New devDep**: `@testing-library/user-event@^14.6.1` for keyboard interaction tests.

19 tests covering all 9 PLAN.md acceptance cases plus 10 extras: custom label, Opindex "Install" badge on desktop, Opindex no badge on desktop with extension, Shift+Tab wrap-around, backdrop-vs-dialog click, onConnected and onAuthenticated callback firing, auto-close on successful connect, error rendering in the modal.
