import {
  createWalletManager,
  type WalletManager,
  type WalletManagerConfig,
} from '@monolithlabs-hub/wallet-connect-core'
import { useEffect, useState, type ReactNode } from 'react'

import { WalletConnectContext } from './wallet-connect-context'

/**
 * Props for {@link WalletConnectProvider}.
 */
export interface WalletConnectProviderProps {
  /**
   * Manager configuration. Identity-tracked: passing a NEW object recreates
   * the manager (and destroys the previous one). Passing a stable reference
   * preserves it.
   *
   * **Don't pass an inline `{...}` literal** — it produces a new identity
   * on every parent render and the manager will be recreated every time.
   * Either define the config object once at module scope, or memoize it
   * at the call site with `useMemo`.
   */
  config: WalletManagerConfig
  children: ReactNode
}

/**
 * Provider that builds a single {@link WalletManager} and shares it via
 * {@link WalletConnectContext}. Every {@link useWallet}/{@link useWalletContext}
 * call beneath the provider reads the same manager instance.
 *
 * **Manager lifecycle**:
 * - Built once via `useState`'s lazy initializer on first mount.
 * - Recreated when the `config` prop identity changes (the previous
 *   manager is destroyed by the useEffect cleanup as React re-runs the
 *   effect for the new manager identity).
 * - Destroyed on unmount.
 *
 * Renders `<WalletConnectContext.Provider>` — no DOM wrapper, no extra
 * elements in the tree.
 *
 * @example
 * ```tsx
 * const walletConfig = {
 *   wallets: [phantom, solflare, opindex],
 *   requireSignIn: true,
 *   signInMessage: (pk) => `Sign in to MyApp as ${pk}`,
 * }
 *
 * <WalletConnectProvider config={walletConfig}>
 *   <App />
 * </WalletConnectProvider>
 * ```
 */
export function WalletConnectProvider({ config, children }: WalletConnectProviderProps): ReactNode {
  // Lazy state init constructs the manager exactly once per mount. Using
  // `useState` (instead of `useMemo`) prevents React from dropping the
  // cache and re-running the side-effecting factory under memory pressure
  // or during strict checks.
  const [state, setState] = useState<{
    config: WalletManagerConfig
    manager: WalletManager
  }>(() => ({ config, manager: createWalletManager(config) }))

  // React-documented "adjust state on prop change" pattern: compare the
  // tracked prop to the live prop during render and `setState` if they
  // differ. React aborts the current render and restarts with the new
  // state. The freshly-created manager replaces the tracked one; the
  // useEffect cleanup below destroys the old one when the effect re-runs
  // against the new identity.
  if (state.config !== config) {
    setState({ config, manager: createWalletManager(config) })
  }

  useEffect(() => {
    // StrictMode-safe rebuild: in dev, React runs effect setup → cleanup
    // → setup on first mount. The cleanup `m.destroy()` destroys the
    // manager, then the re-setup runs against the same `useState`-stored
    // instance. Detect that case and rebuild via `setState` — the
    // re-render picks up the fresh manager and the effect installs a new
    // cleanup against it. Production never enters this branch.
    //
    // The eslint rule below would normally flag setState-in-effect as a
    // smell — and it is, except when the setState is correcting a
    // dependency-mirrored state slot to match an external-system
    // observation that can only be made post-commit. That's exactly
    // this case: `isDestroyed()` only becomes true after the cleanup
    // fires, which is necessarily inside the effect lifecycle.
    if (state.manager.isDestroyed()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState((s) => ({ ...s, manager: createWalletManager(s.config) }))
      return
    }
    const m = state.manager
    return () => {
      m.destroy()
    }
  }, [state.manager])

  return (
    <WalletConnectContext.Provider value={state.manager}>{children}</WalletConnectContext.Provider>
  )
}
