import {
  detectPlatform,
  type FlowState,
  type PlatformInfo,
  type WalletConfig,
} from '@monolithlabs/wallet-connect-core'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { useWalletContext } from '../context/use-wallet-context'
import { useWallet } from '../hooks/use-wallet'

/**
 * Props for {@link ConnectButton}.
 */
export interface ConnectButtonProps {
  /** Label on the button when disconnected. Default: `"Connect Wallet"`. */
  label?: string
  /**
   * Fallback label on the button when the flow is in a `connected` /
   * `signing` / `authenticated` state but no public key is available to
   * truncate. In practice the FlowMachine sets `publicKey` before
   * transitioning to `connected`, so the visible label is normally the
   * truncated key — this prop is the safety net for that invariant.
   * Default: `"Connected"`.
   */
  connectedLabel?: string
  className?: string
  style?: CSSProperties
  /** Fires once when the connect flow completes successfully. */
  onConnected?: (publicKey: string) => void
  /**
   * Fires once when SIWS sign-in completes successfully. Only fires for
   * managers configured with `requireSignIn: true`.
   */
  onAuthenticated?: (publicKey: string, signature: string) => void
}

const DEFAULT_LABEL = 'Connect Wallet'
const DEFAULT_CONNECTED_LABEL = 'Connected'
const PINNED_WALLET_ID = 'opindex'

/**
 * Truncate a base58 public key for display. `ABC...XYZ` style with 4 chars
 * on each side by default. Inputs shorter than the head + tail are returned
 * verbatim.
 */
function truncatePublicKey(pubkey: string, head = 4, tail = 4): string {
  if (pubkey.length <= head + tail) return pubkey
  return `${pubkey.slice(0, head)}…${pubkey.slice(-tail)}`
}

function badgeFor(wallet: WalletConfig, platform: PlatformInfo): 'Get' | 'Install' | null {
  if (wallet.id !== PINNED_WALLET_ID) return null
  if (platform.isMobile) return 'Get'
  if (!platform.hasOpindexExtension) return 'Install'
  return null
}

function isFlowStateConnected(state: FlowState): boolean {
  return state === 'connected' || state === 'signing' || state === 'authenticated'
}

/**
 * Ready-to-use button that runs the full wallet connect flow.
 *
 * - Disconnected: shows `label` ("Connect Wallet" by default). Clicking
 *   opens a modal listing the manager's sorted wallets. The pinned wallet
 *   carries a "Get" badge on mobile (iOS cannot probe for installed apps,
 *   so we always invite the user to install) and an "Install" badge on
 *   desktop without the Opindex extension detected.
 * - Connected: the button shows a truncated public key. Clicking opens
 *   the modal in "connected" mode with a Disconnect action.
 *
 * The modal is accessible: `role="dialog"`, `aria-modal="true"`, an
 * `aria-labelledby` link to the modal heading, a Tab/Shift+Tab focus trap,
 * Escape-to-close, and initial focus moved to the first focusable element
 * on open.
 *
 * The component is self-contained — it does NOT yet depend on
 * `@monolithlabs/wallet-connect-ui`. When TASK-401 / TASK-402 land, the
 * modal shell and wallet-list-item primitives will be extracted there and
 * this component will re-implement on top of them.
 */
export function ConnectButton({
  label = DEFAULT_LABEL,
  connectedLabel = DEFAULT_CONNECTED_LABEL,
  className,
  style,
  onConnected,
  onAuthenticated,
}: ConnectButtonProps): ReactNode {
  const wallet = useWallet()
  const manager = useWalletContext()
  const [open, setOpen] = useState(false)
  // Lazy init so detectPlatform (which reads navigator) runs once per mount.
  const [platform] = useState<PlatformInfo>(() => detectPlatform())

  const titleId = useId()

  // Fire `onConnected` / `onAuthenticated` on flow-state transitions. The
  // WalletManager already exposes the same callbacks on its config, but the
  // ConnectButton props let consumers attach instance-scoped handlers
  // without having to thread the manager-level config in for every button.
  //
  // The modal **auto-closes on the `authenticated` transition** rather than
  // on `connected`. For `requireSignIn: false` flows the FlowMachine
  // auto-steps `connected → authenticated` in the same dispatch, so the
  // close timing is unchanged. For `requireSignIn: true` flows the modal
  // stays open through the `signing` state — the user keeps seeing the
  // dialog while their wallet shows a sign prompt, instead of the dApp
  // silently dropping back to "connected" UI mid-flow.
  const prevStateRef = useRef<FlowState>(wallet.state)
  useEffect(() => {
    const prev = prevStateRef.current
    const curr = wallet.state
    prevStateRef.current = curr

    const wasConnected = isFlowStateConnected(prev)
    const isNowConnected = isFlowStateConnected(curr)

    if (!wasConnected && isNowConnected && wallet.publicKey) {
      onConnected?.(wallet.publicKey)
    }

    if (prev !== 'authenticated' && curr === 'authenticated') {
      // The signature isn't exposed on `useWallet`'s return — read it from
      // the manager's flow context at the transition point.
      const ctx = manager.getContext()
      if (ctx.publicKey && ctx.signature) {
        onAuthenticated?.(ctx.publicKey, ctx.signature)
      }
      setOpen(false)
    }
  }, [wallet.state, wallet.publicKey, manager, onConnected, onAuthenticated])

  // Use `manager.connect(id)` directly rather than `wallet.select(id);
  // wallet.connect();` because the latter has a stale-closure issue in the
  // same handler — `wallet.connect` closes over the pre-`select` value of
  // `selectedWalletId`. The manager API takes the id explicitly and is
  // immune to that.
  const handleSelectWallet = useCallback(
    async (walletId: string) => {
      try {
        await manager.connect(walletId)
      } catch {
        // Errors land on `wallet.error`; the modal renders that branch.
      }
    },
    [manager],
  )

  // `wallet.disconnect` is a stable reference across renders (useWallet
  // wraps it in `useCallback([manager])`), so the dep array hits its
  // memo cache. The earlier `[wallet]` dep was a fresh object every
  // render and made the memo useless.
  const walletDisconnect = wallet.disconnect
  const handleDisconnect = useCallback(async () => {
    try {
      await walletDisconnect()
    } catch {
      // Best-effort. The FlowMachine RESET runs unconditionally; the
      // adapter throw is swallowed by `manager.disconnect()`.
    }
    setOpen(false)
  }, [walletDisconnect])

  const truncated = wallet.publicKey ? truncatePublicKey(wallet.publicKey) : null
  // Connected for display purposes — the flow has entered the
  // `connected | signing | authenticated` cluster. Public key may not yet
  // be set in the (rare) instant before `WALLET_CONNECTED` lands; the
  // `connectedLabel` fallback covers that case.
  const isConnected = isFlowStateConnected(wallet.state)

  const buttonLabel = isConnected ? (truncated ?? connectedLabel) : label
  const buttonAriaLabel = isConnected
    ? `Wallet menu — connected as ${truncated ?? 'unknown'}`
    : label

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={buttonAriaLabel}
        className={className}
        style={style}
      >
        {buttonLabel}
      </button>
      {open ? (
        <WalletModal
          titleId={titleId}
          title={isConnected ? 'Connected' : 'Select a wallet'}
          onClose={() => setOpen(false)}
        >
          {isConnected ? (
            <ConnectedView
              publicKey={wallet.publicKey ?? ''}
              walletName={wallet.wallet?.name ?? null}
              onDisconnect={handleDisconnect}
              disconnecting={wallet.disconnecting}
            />
          ) : (
            <WalletList
              wallets={wallet.sortedWallets}
              platform={platform}
              state={wallet.state}
              connectingWalletId={wallet.wallet?.id ?? null}
              errorMessage={wallet.error?.message ?? null}
              onSelect={handleSelectWallet}
            />
          )}
        </WalletModal>
      ) : null}
    </>
  )
}

// ---------------------------------------------------------------------------
// Internal components — to be extracted into @monolithlabs/wallet-connect-ui
// when TASK-401 / TASK-402 land.
// ---------------------------------------------------------------------------

interface WalletModalProps {
  titleId: string
  title: string
  onClose: () => void
  children: ReactNode
}

function WalletModal({ titleId, title, onClose, children }: WalletModalProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null)

  // Initial focus + focus trap + focus restoration on close.
  useEffect(() => {
    const root = dialogRef.current
    if (!root) return

    // Remember the element that had focus before the dialog opened so we
    // can return focus to it on close (WCAG modal-pattern guidance).
    // Typically this is the <ConnectButton> trigger. If the trigger is no
    // longer in the DOM at close time, `.focus()` is a no-op.
    const previouslyFocused = document.activeElement as HTMLElement | null

    const getFocusable = (): HTMLElement[] => {
      const selector =
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      return Array.from(root.querySelectorAll<HTMLElement>(selector))
    }

    // Move focus into the dialog on open. Pick the first focusable element
    // — typically the close button or the first wallet in the list.
    const focusables = getFocusable()
    focusables[0]?.focus()

    // Use an arrow function so the `root` narrowing from `if (!root) return`
    // flows into the closure. A `function` declaration would re-widen.
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab') return
      const items = getFocusable()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      if (!first || !last) return
      const active = document.activeElement as HTMLElement | null

      if (event.shiftKey) {
        if (active === first || !root.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else {
        if (active === last || !root.contains(active)) {
          event.preventDefault()
          first.focus()
        }
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      // Restore focus to the element that opened the dialog. Guard with
      // `?.focus?.()` because `previouslyFocused` may be `null` (no
      // active element) or, in some test environments, a non-element
      // node that lacks `focus()`.
      previouslyFocused?.focus?.()
    }
  }, [onClose])

  return (
    <div
      role="presentation"
      style={modalBackdropStyle}
      onClick={(e) => {
        // Click on the backdrop (NOT a descendant) closes the modal.
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={modalContentStyle}
      >
        <header style={modalHeaderStyle}>
          <h2 id={titleId} style={modalTitleStyle}>
            {title}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close" style={modalCloseButtonStyle}>
            {'×'}
          </button>
        </header>
        <div>{children}</div>
      </div>
    </div>
  )
}

interface WalletListProps {
  wallets: readonly WalletConfig[]
  platform: PlatformInfo
  state: FlowState
  connectingWalletId: string | null
  errorMessage: string | null
  onSelect: (walletId: string) => void
}

function WalletList({
  wallets,
  platform,
  state,
  connectingWalletId,
  errorMessage,
  onSelect,
}: WalletListProps): ReactNode {
  if (wallets.length === 0) {
    return <p style={{ padding: '12px 16px', margin: 0 }}>No wallets configured.</p>
  }
  return (
    <ul role="list" style={walletListStyle}>
      {wallets.map((wallet) => {
        const badge = badgeFor(wallet, platform)
        const isConnecting = state === 'connecting' && connectingWalletId === wallet.id
        return (
          <li key={wallet.id} style={{ margin: 0 }}>
            <button
              type="button"
              data-wallet-id={wallet.id}
              onClick={() => onSelect(wallet.id)}
              disabled={state === 'connecting' || state === 'signing'}
              style={walletItemButtonStyle}
            >
              {wallet.icon ? (
                <img src={wallet.icon} alt="" width={24} height={24} style={{ borderRadius: 4 }} />
              ) : (
                <span aria-hidden="true" style={walletIconPlaceholderStyle} />
              )}
              <span style={{ flex: 1, textAlign: 'left' }}>{wallet.name}</span>
              {isConnecting ? <span style={walletStatusStyle}>Connecting…</span> : null}
              {badge ? <span style={walletBadgeStyle}>{badge}</span> : null}
            </button>
          </li>
        )
      })}
      {errorMessage ? (
        <li role="alert" style={errorRowStyle}>
          {errorMessage}
        </li>
      ) : null}
    </ul>
  )
}

interface ConnectedViewProps {
  publicKey: string
  walletName: string | null
  disconnecting: boolean
  onDisconnect: () => void
}

function ConnectedView({
  publicKey,
  walletName,
  disconnecting,
  onDisconnect,
}: ConnectedViewProps): ReactNode {
  return (
    <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {walletName ? <p style={{ margin: 0, fontWeight: 600 }}>{walletName}</p> : null}
      <p style={{ margin: 0, fontFamily: 'monospace', wordBreak: 'break-all' }}>{publicKey}</p>
      <button
        type="button"
        onClick={onDisconnect}
        disabled={disconnecting}
        style={disconnectButtonStyle}
      >
        {disconnecting ? 'Disconnecting…' : 'Disconnect'}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Minimal inline default styling. Consumers can override via className /
// style on the root button and via CSS targeting the standard ARIA selectors
// (`[role="dialog"]`, etc.) for the modal. A future TASK-401 will lift these
// into the headless UI package.
// ---------------------------------------------------------------------------

const modalBackdropStyle: CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
}

const modalContentStyle: CSSProperties = {
  background: '#fff',
  color: '#111',
  borderRadius: 12,
  minWidth: 320,
  maxWidth: 'min(420px, calc(100vw - 32px))',
  maxHeight: 'calc(100vh - 32px)',
  overflow: 'auto',
  boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
}

const modalHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '12px 16px',
  borderBottom: '1px solid rgba(0,0,0,0.08)',
}

const modalTitleStyle: CSSProperties = { margin: 0, fontSize: 18 }

const modalCloseButtonStyle: CSSProperties = {
  background: 'transparent',
  border: 'none',
  fontSize: 22,
  lineHeight: 1,
  cursor: 'pointer',
  padding: 4,
}

const walletListStyle: CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 8,
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
}

const walletItemButtonStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 12,
  width: '100%',
  padding: '10px 12px',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 8,
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
}

const walletIconPlaceholderStyle: CSSProperties = {
  display: 'inline-block',
  width: 24,
  height: 24,
  borderRadius: 4,
  background: 'rgba(0,0,0,0.08)',
}

const walletBadgeStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  padding: '2px 8px',
  borderRadius: 999,
  background: 'rgba(0,0,0,0.08)',
}

const walletStatusStyle: CSSProperties = {
  fontSize: 12,
  color: 'rgba(0,0,0,0.6)',
}

const errorRowStyle: CSSProperties = {
  margin: '8px 12px 0',
  padding: '8px 12px',
  borderRadius: 8,
  background: 'rgba(220, 38, 38, 0.08)',
  color: 'rgb(185, 28, 28)',
  fontSize: 13,
}

const disconnectButtonStyle: CSSProperties = {
  padding: '8px 12px',
  border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 8,
  background: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
  color: 'inherit',
}
