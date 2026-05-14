import type { WalletManagerConfig } from '@monolithlabs/wallet-connect-core'
import { ConnectButton, WalletConnectProvider } from '@monolithlabs/wallet-connect-react'
import { useEffect, useState } from 'react'

import { WalletInfo } from './WalletInfo'
import { OPINDEX, PHANTOM, SOLFLARE } from './wallets'

/**
 * Four demos, one hash-routed page. Each demo carries its own
 * `<WalletConnectProvider>` so the `WalletManagerConfig` for each scenario
 * is fully isolated (manager-per-route — only the active demo's
 * Provider/Manager is mounted at a time).
 *
 * - `#basic`    — minimal connect button, `requireSignIn: false`.
 * - `#siws`     — adds SIWS sign-in (`requireSignIn: true`), shows the
 *                 returned signature inline.
 * - `#priority` — Solflare wins lowest priority, Phantom second, Opindex
 *                 third — visible on desktop without the Opindex extension
 *                 (Opindex pin only fires on mobile / desktop-with-extension).
 * - `#neutral`  — `pinnedWallet: null` disables the Opindex pin entirely,
 *                 so the list sorts by `priority` alone (neutral mode for
 *                 library consumers who don't want any default pin).
 *
 * Default route is `#basic` so the existing Playwright suite at `/` sees
 * the same single-button page it did before this file was expanded.
 */

type Route = 'basic' | 'siws' | 'priority' | 'neutral'

const ROUTES: ReadonlyArray<{ id: Route; label: string }> = [
  { id: 'basic', label: 'Basic' },
  { id: 'siws', label: 'SIWS sign-in' },
  { id: 'priority', label: 'Custom priority' },
  { id: 'neutral', label: 'Neutral (no pin)' },
]

function isRoute(value: string): value is Route {
  return ROUTES.some((r) => r.id === value)
}

function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash))
  useEffect(() => {
    function handler(): void {
      setRoute(parseRoute(window.location.hash))
    }
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])
  return route
}

function parseRoute(hash: string): Route {
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash
  return isRoute(stripped) ? stripped : 'basic'
}

export function App() {
  const route = useHashRoute()

  return (
    <main style={mainStyle}>
      <header style={headerStyle}>
        <h1 style={titleStyle}>wallet-connect example</h1>
        <p style={leadStyle}>
          Live demos of <code>@monolithlabs/wallet-connect-react</code>. Pick a scenario from the
          navigation, click <strong>Connect Wallet</strong>, and watch the flow state update inline.
        </p>
        <nav style={navStyle} aria-label="Demos">
          {ROUTES.map((r) => (
            <a
              key={r.id}
              href={`#${r.id}`}
              data-route={r.id}
              aria-current={route === r.id ? 'page' : undefined}
              style={{
                ...navLinkStyle,
                ...(route === r.id ? navLinkActiveStyle : null),
              }}
            >
              {r.label}
            </a>
          ))}
        </nav>
      </header>

      {route === 'basic' ? <BasicDemo /> : null}
      {route === 'siws' ? <SiwsDemo /> : null}
      {route === 'priority' ? <PriorityDemo /> : null}
      {route === 'neutral' ? <NeutralDemo /> : null}
    </main>
  )
}

// ---------------------------------------------------------------------------
// Demo 1 — basic connect, no sign-in.
// ---------------------------------------------------------------------------

// Module-scope config so the object identity is stable across re-renders.
// Passing an inline `{...}` literal to <WalletConnectProvider config={...}>
// would force the manager to rebuild on every parent render — documented
// on the Provider's JSDoc.
const basicConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  // requireSignIn: false → the flow stops at `authenticated` immediately
  // after the wallet returns a public key (no SIWS sign step).
  requireSignIn: false,
}

function BasicDemo() {
  return (
    <WalletConnectProvider config={basicConfig}>
      <Section
        title="Basic connect"
        description="Default configuration — three wallets, Opindex pinning enabled, no sign-in step. Once the wallet returns a public key, the flow lands in `authenticated`."
      >
        <ConnectButton />
        <WalletInfo />
      </Section>
    </WalletConnectProvider>
  )
}

// ---------------------------------------------------------------------------
// Demo 2 — connect + SIWS sign-in (`requireSignIn: true`).
// ---------------------------------------------------------------------------

const siwsConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  // requireSignIn: true → after the wallet returns a public key, the
  // manager calls signIn(...) and the flow becomes
  // `connecting → connected → signing → authenticated`. On mobile the
  // SIWS message is bundled into the connect deep link so it's one
  // round trip; on desktop the wallet shows a second signing prompt.
  requireSignIn: true,
  // The signed message body. The PUBLIC KEY is interpolated *after*
  // connect on desktop; on mobile this is called with `''` because the
  // public key isn't known when the deep link is built (the wallet
  // substitutes its own address per the SIWS spec's optional `address`
  // field). Consumers should handle the empty-arg case.
  signInMessage: (publicKey) =>
    publicKey === ''
      ? 'Sign in to the wallet-connect example.'
      : `Sign in to wallet-connect example.\nAccount: ${publicKey}`,
  onAuthenticated: (publicKey, signature) => {
    console.log('[example/siws] authenticated', { publicKey, signature })
  },
}

function SiwsDemo() {
  return (
    <WalletConnectProvider config={siwsConfig}>
      <Section
        title="Connect with Sign-In With Solana"
        description="`requireSignIn: true` chains a SIWS signature onto the connect flow. The modal stays open through the signing step; on mobile the SIWS message is bundled into the connect deep link so it's one round trip."
      >
        <ConnectButton />
        <WalletInfo />
      </Section>
    </WalletConnectProvider>
  )
}

// ---------------------------------------------------------------------------
// Demo 3 — custom wallet priority (re-orders the non-pinned wallets).
// ---------------------------------------------------------------------------

const priorityConfig: WalletManagerConfig = {
  // Re-order: Solflare priority 1, Phantom 2, Opindex 3. Lower numbers
  // sort first among non-pinned wallets. On desktop *without* the
  // Opindex extension the list reads Solflare → Phantom → Opindex (last
  // because Opindex's pin is suppressed). On mobile (or desktop with the
  // Opindex extension) Opindex still pins to index 0, then the remainder
  // sorts Solflare → Phantom.
  wallets: [
    { ...OPINDEX, priority: 3 },
    { ...PHANTOM, priority: 2 },
    { ...SOLFLARE, priority: 1 },
  ],
  requireSignIn: false,
}

function PriorityDemo() {
  return (
    <WalletConnectProvider config={priorityConfig}>
      <Section
        title="Custom wallet priority"
        description="`WalletConfig.priority` orders non-pinned wallets ascending. Here Solflare is priority 1, Phantom 2, Opindex 3 — Solflare leads on desktop without the Opindex extension; on mobile the Opindex pin still wins index 0."
      >
        <ConnectButton />
        <WalletInfo />
      </Section>
    </WalletConnectProvider>
  )
}

// ---------------------------------------------------------------------------
// Demo 4 — neutral mode (`pinnedWallet: null`).
// ---------------------------------------------------------------------------

const neutralConfig: WalletManagerConfig = {
  wallets: [OPINDEX, PHANTOM, SOLFLARE],
  // `pinnedWallet: null` disables the platform-aware pin entirely.
  // The default is `'opindex'`; pass `null` for fully neutral mode where
  // the list sorts by `priority` only and no wallet is forced to index 0.
  pinnedWallet: null,
  requireSignIn: false,
}

function NeutralDemo() {
  return (
    <WalletConnectProvider config={neutralConfig}>
      <Section
        title="Neutral mode (no Opindex pinning)"
        description="`pinnedWallet: null` disables the Opindex pin everywhere — including mobile. The wallet list sorts purely by priority. Use this in consumer dapps that want to surface wallets neutrally."
      >
        <ConnectButton />
        <WalletInfo />
      </Section>
    </WalletConnectProvider>
  )
}

// ---------------------------------------------------------------------------
// Shared section shell.
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string
  description: string
  children: React.ReactNode
}

function Section({ title, description, children }: SectionProps) {
  return (
    <section style={sectionStyle}>
      <h2 style={sectionTitleStyle}>{title}</h2>
      <p style={sectionDescStyle}>{description}</p>
      <div style={sectionBodyStyle}>{children}</div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Inline default styling. Kept inline so the example has zero CSS deps.
// Responsive via `max-width` + `padding` that scales with the viewport.
// ---------------------------------------------------------------------------

const mainStyle: React.CSSProperties = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 720,
  margin: '0 auto',
  padding: 'clamp(16px, 4vw, 32px)',
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
}

const headerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 'clamp(20px, 5vw, 28px)',
  letterSpacing: '-0.02em',
}

const leadStyle: React.CSSProperties = {
  margin: 0,
  color: 'rgba(0, 0, 0, 0.7)',
  lineHeight: 1.5,
}

const navStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 8,
  marginTop: 4,
}

const navLinkStyle: React.CSSProperties = {
  padding: '6px 12px',
  borderRadius: 999,
  // Use longhand borderColor (not the `border` shorthand) so the active
  // state can override just the color without React 19 flagging a
  // shorthand-vs-longhand mismatch during re-render.
  borderStyle: 'solid',
  borderWidth: 1,
  borderColor: 'rgba(0, 0, 0, 0.12)',
  color: 'rgba(0, 0, 0, 0.7)',
  textDecoration: 'none',
  fontSize: 14,
  background: 'transparent',
}

const navLinkActiveStyle: React.CSSProperties = {
  background: '#111',
  color: '#fff',
  borderColor: '#111',
}

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: 20,
  borderRadius: 12,
  border: '1px solid rgba(0, 0, 0, 0.08)',
  background: 'rgba(0, 0, 0, 0.02)',
}

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
}

const sectionDescStyle: React.CSSProperties = {
  margin: 0,
  color: 'rgba(0, 0, 0, 0.7)',
  fontSize: 14,
  lineHeight: 1.5,
}

const sectionBodyStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  alignItems: 'flex-start',
}
