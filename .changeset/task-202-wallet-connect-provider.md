---
'@monolithlabs/wallet-connect-react': minor
---

TASK-202 — add `<WalletConnectProvider>` and `useWalletContext()` to `@monolithlabs/wallet-connect-react`.

**`<WalletConnectProvider config={...}>`** wraps a subtree and shares a single `WalletManager` with every `useWallet()` / `useWalletContext()` underneath it. The manager is built once via `useState`'s lazy initializer (so the side-effecting factory doesn't run more than necessary), recreated when the `config` prop **identity** changes (React-documented "adjust state on prop change" pattern — `setState` during render), and destroyed both when a new config takes over and on unmount. The provider renders `<WalletConnectContext.Provider>` directly with no DOM wrapper.

Caveat documented in JSDoc: don't pass an inline `{...}` literal as `config` — the manager will be recreated on every parent render. Define the config once at module scope or memoize it.

**`useWalletContext()`** reads the manager directly from context; throws `useWalletContext() must be used inside a <WalletConnectProvider>` if no provider is present. Lower-level than `useWallet()` — reach for it when you need the raw manager (e.g., to call methods outside `useWallet`'s return shape, or to build alternative React integrations on top of the manager).

`useWallet()` continues to support both modes from TASK-201: read from a provider (preferred), or pass `config` directly to self-own a manager scoped to the calling component.

8 provider tests covering the 4 PLAN.md cases (manager in context, useWallet reads from provider, single instance across consumers, descriptive no-provider error) plus 4 extras: no-DOM-wrapper, destroy-on-unmount, recreate + destroy-old on config identity change, stable across re-renders with the same config reference. All context files at 100% coverage.
