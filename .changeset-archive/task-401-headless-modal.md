---
'@monolithlabs-hub/wallet-connect-ui': minor
---

TASK-401 — add the headless modal primitives to `@monolithlabs-hub/wallet-connect-ui`.

Framework-agnostic DOM-level building blocks for accessible modal dialogs. No React or Vue imports — `@monolithlabs-hub/wallet-connect-react`'s and `@monolithlabs-hub/wallet-connect-vue`'s `<ConnectButton>` components will migrate onto these in a follow-up so both packages share one implementation of focus trap / scroll lock / ARIA.

Exports from `@monolithlabs-hub/wallet-connect-ui`:

- **`attachModal({ root, onRequestClose, initialFocus?, scrollLock?, restoreFocus? })`** — single entry point that wires the full modal lifecycle: capture previous focus, lock body scroll, move initial focus into the dialog (first focusable by default or an explicit target; pass `false` to opt out), install Tab/Shift+Tab focus trap, install Escape handler. Returns a `{ destroy() }` handle; the consumer holds open/close state and calls `destroy()` on close. SSR-safe: returns a no-op handle when `document` is undefined.
- **`createFocusTrap({ root, onEscape? })`** — narrower primitive for callers that want only the keyboard wrap-around without scroll lock or initial focus. Reads focusables LIVE on every keypress so DOM mutations after attach are picked up automatically.
- **`getFocusableElements(root)`** — pure DOM query returning focusable descendants in DOM order. Excludes `[disabled]` and `tabindex="-1"`.
- **`lockBodyScroll()`** — refcounted body scroll lock; nested calls compose, body overflow only restores when the LAST release fires. Returns an idempotent release fn.
- **`getDialogAttributes(titleId)`** — pure helper returning the standard `{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId }` bag for spreading onto the dialog element.

35 tests across the four modules covering all 5 PLAN.md acceptance criteria (focus cycling, Escape closes, ARIA attributes, scroll lock applied + restored, no framework deps) plus SSR-mode no-op behavior, idempotent destroy, nested-modal scroll-lock composition, initial-focus opt-out, focus restoration. 100% function and line coverage on the modal directory.

**Note**: the React and Vue `<ConnectButton>` components still inline equivalent logic. A follow-up will migrate them onto `attachModal` so the implementation lives in one place — TASK-203 / TASK-303 explicitly promised this extraction once TASK-401 landed.
