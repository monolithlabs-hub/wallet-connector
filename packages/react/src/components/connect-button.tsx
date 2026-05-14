import {
  type FlowState,
  type PlatformInfo,
  type WalletConfig,
} from '@monolithlabs/wallet-connect-core'
import {
  attachModal,
  getDialogAttributes,
  getInstallBadge,
  truncatePublicKey,
} from '@monolithlabs/wallet-connect-ui'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

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

function isFlowStateConnected(state: FlowState): boolean {
  return state === 'connected' || state === 'signing' || state === 'authenticated'
}

/**
 * Compute whether the pinned-wallet badge should render for `wallet`.
 *
 * Mobile: always show (iOS can't probe for installed apps).
 * Desktop with the extension detected: hide.
 * Desktop without the extension: show with the "Install" badge.
 */
function shouldShowInstallBadge(wallet: WalletConfig, platform: PlatformInfo): boolean {
  if (wallet.id !== PINNED_WALLET_ID) return false
  if (platform.isMobile) return true
  return !platform.hasOpindexExtension
}

/**
 * Ready-to-use button that runs the full wallet connect flow.
 *
 * - Disconnected: shows `label` ("Connect Wallet" by default). Clicking
 *   opens a modal listing the manager's sorted wallets. The pinned
 *   wallet carries a "Get" badge on iOS (App Store convention) and an
 *   "Install" badge on Android / desktop without the Opindex extension.
 * - Connected: the button shows a truncated public key. Clicking opens
 *   the modal in "connected" mode with a Disconnect action.
 *
 * Modal accessibility, focus management, and body scroll lock are
 * handled by `@monolithlabs/wallet-connect-ui`'s {@link attachModal} —
 * see `WalletModal` below for the integration.
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
  const [open, setOpen] = useState(false)
  // Platform comes from the manager — it reflects BOTH the legacy
  // `window.opindex` sentinel AND the Wallet Standard registry so
  // late-registering Opindex flips `hasOpindexExtension` automatically.
  const platform = wallet.platform

  const titleId = useId()

  // Fire `onConnected` / `onAuthenticated` on flow-state transitions.
  // Auto-closes on the `authenticated` transition rather than `connected`
  // so requireSignIn flows keep the dialog visible through the signing
  // step (see TASK-203 review).
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
      if (wallet.publicKey && wallet.signature) {
        onAuthenticated?.(wallet.publicKey, wallet.signature)
      }
      setOpen(false)
    }
  }, [wallet.state, wallet.publicKey, wallet.signature, onConnected, onAuthenticated])

  // Pass the walletId straight into `wallet.connect` — bypasses the React
  // state cycle (no need for `select()` first).
  const walletConnect = wallet.connect
  const handleSelectWallet = useCallback(
    async (walletId: string) => {
      try {
        await walletConnect(walletId)
      } catch {
        // Errors land on `wallet.error`; the modal renders that branch.
      }
    },
    [walletConnect],
  )

  const walletDisconnect = wallet.disconnect
  const handleDisconnect = useCallback(async () => {
    try {
      await walletDisconnect()
    } catch {
      // Best-effort. The FlowMachine RESET runs unconditionally.
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
// Internal rendering helpers. Lifecycle / a11y wiring delegated to
// `@monolithlabs/wallet-connect-ui` (TASK-401); this file only owns the JSX
// shape and the inline default styling.
// ---------------------------------------------------------------------------

interface WalletModalProps {
  titleId: string
  title: string
  onClose: () => void
  children: ReactNode
}

function WalletModal({ titleId, title, onClose, children }: WalletModalProps): ReactNode {
  const dialogRef = useRef<HTMLDivElement>(null)
  // Stabilize the close callback via a ref so attaching `attachModal`
  // doesn't re-fire when the parent re-renders with a fresh inline
  // closure. The ref is updated in a useEffect (not during render) to
  // satisfy `react-hooks/refs`. Timing: between render and effect the
  // ref points at the previous closure — fine for our case since both
  // resolve to `() => setOpen(false)` and setOpen is stable.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const handle = attachModal({
      root: dialog,
      onRequestClose: () => onCloseRef.current(),
    })
    return () => handle.destroy()
  }, [])

  return (
    <div
      role="presentation"
      style={modalBackdropStyle}
      onClick={(e) => {
        // Click on the backdrop (NOT a descendant) closes the modal.
        if (e.target === e.currentTarget) onCloseRef.current()
      }}
    >
      <div ref={dialogRef} {...getDialogAttributes(titleId)} style={modalContentStyle}>
        <header style={modalHeaderStyle}>
          <h2 id={titleId} style={modalTitleStyle}>
            {title}
          </h2>
          <button
            type="button"
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            style={modalCloseButtonStyle}
          >
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
        const badge = getInstallBadge({
          shouldShow: shouldShowInstallBadge(wallet, platform),
          isIOS: platform.isIOS,
        })
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
// (`[role="dialog"]`, etc.) for the modal.
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
