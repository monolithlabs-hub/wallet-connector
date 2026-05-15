import {
  createFlowMachine,
  WalletConnectionError,
  type FlowMachine,
  type PlatformInfo,
  type WalletListEntry,
  type WalletManager,
} from '@monolithlabs-hub/wallet-connect-core'
import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { WalletConnectContext } from '../context/wallet-connect-context'

import { ConnectButton } from './connect-button'

// --- Fixtures ------------------------------------------------------------

const OPINDEX: WalletListEntry = {
  id: 'opindex',
  name: 'Opindex',
  priority: 10,
  icon: '',
  isDetected: false,
  source: 'configured',
  deepLinkScheme: 'opindex://',
  universalLink: 'https://opindex.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const PHANTOM: WalletListEntry = {
  id: 'phantom',
  name: 'Phantom',
  priority: 1,
  icon: '',
  isDetected: false,
  source: 'configured',
  deepLinkScheme: 'phantom://',
  universalLink: 'https://phantom.app/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const SOLFLARE: WalletListEntry = {
  id: 'solflare',
  name: 'Solflare',
  priority: 2,
  icon: '',
  isDetected: false,
  source: 'configured',
  deepLinkScheme: 'solflare://',
  universalLink: 'https://solflare.com/ul/v1/connect',
  appStoreUrl: '',
  playStoreUrl: '',
}

const MOBILE_PLATFORM: PlatformInfo = {
  isMobile: true,
  isIOS: true,
  isAndroid: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'deeplink',
}

const DESKTOP_NO_EXTENSION: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'install-prompt',
}

const DESKTOP_WITH_OPINDEX: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: true,
  hasOpindexExtension: true,
  strategy: 'extension',
}

// --- Mock manager -------------------------------------------------------

interface MockManager {
  manager: WalletManager
  machine: FlowMachine
  connectSpy: ReturnType<typeof vi.fn>
  disconnectSpy: ReturnType<typeof vi.fn>
  initializeSpy: ReturnType<typeof vi.fn>
  setPlatform: (next: PlatformInfo) => void
  setSortedWallets: (next: WalletListEntry[]) => void
  /** Force a registry-style notification without changing FlowState. */
  notifyRegistryChange: () => void
}

function makeMockManager(opts: {
  wallets: WalletListEntry[]
  sortedWallets?: WalletListEntry[]
  platform?: PlatformInfo
}): MockManager {
  const machine = createFlowMachine()
  const connectSpy = vi.fn(async (walletId: string) => {
    machine.send({ type: 'CONNECT_INITIATED', walletId })
  })
  const disconnectSpy = vi.fn(async () => {
    machine.send({ type: 'RESET' })
  })
  const initializeSpy = vi.fn()

  let platform: PlatformInfo = opts.platform ?? {
    isMobile: false,
    isIOS: false,
    isAndroid: false,
    hasExtension: true,
    hasOpindexExtension: false,
    strategy: 'extension',
  }
  let sorted: WalletListEntry[] = opts.sortedWallets ?? opts.wallets
  let version = 0
  const listeners = new Set<(state: ReturnType<FlowMachine['getState']>) => void>()
  function notify() {
    version += 1
    const state = machine.getState()
    for (const listener of [...listeners]) listener(state)
  }
  machine.subscribe(() => notify())

  const manager: WalletManager = {
    initialize: initializeSpy,
    connect: connectSpy,
    disconnect: disconnectSpy,
    signMessage: vi.fn(async () => new Uint8Array()),
    signIn: vi.fn(),
    getState: () => machine.getState(),
    getContext: () => machine.getContext(),
    getSortedWallets: () => sorted,
    getPlatform: () => platform,
    getVersion: () => version,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    isDestroyed: () => false,
    destroy: vi.fn(),
  }

  return {
    manager,
    machine,
    connectSpy,
    disconnectSpy,
    initializeSpy,
    setPlatform: (next) => {
      platform = next
    },
    setSortedWallets: (next) => {
      sorted = next
    },
    notifyRegistryChange: () => notify(),
  }
}

function wrap(manager: WalletManager) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <WalletConnectContext.Provider value={manager}>{children}</WalletConnectContext.Provider>
  }
}

afterEach(() => {
  // DOM cleanup is owned by `packages/react/vitest.setup.ts`.
  vi.clearAllMocks()
})

// --- Tests --------------------------------------------------------------

describe('ConnectButton', () => {
  it('renders the "Connect Wallet" button by default', () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    const btn = screen.getByRole('button', { name: /connect wallet/i })
    expect(btn).toBeDefined()
    expect(btn.textContent).toBe('Connect Wallet')
  })

  it('respects a custom label prop', () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton label="Sign in" />, { wrapper: wrap(mock.manager) })

    expect(screen.getByRole('button', { name: 'Sign in' })).toBeDefined()
  })

  it('clicking the button opens the wallet modal', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    expect(screen.queryByRole('dialog')).toBeNull()

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const dialog = screen.getByRole('dialog')
    expect(dialog).toBeDefined()
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('wallet list shows Opindex first on mobile', async () => {
    const user = userEvent.setup()
    // Sorted output: Opindex pinned first on mobile (per TASK-102 rules).
    const mock = makeMockManager({
      wallets: [PHANTOM, SOLFLARE, OPINDEX],
      sortedWallets: [OPINDEX, PHANTOM, SOLFLARE],
      platform: MOBILE_PLATFORM,
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const dialog = screen.getByRole('dialog')
    const walletButtons = within(dialog)
      .getAllByRole('button')
      .filter((b) => b.hasAttribute('data-wallet-id'))
    expect(walletButtons.map((b) => b.getAttribute('data-wallet-id'))).toEqual([
      'opindex',
      'phantom',
      'solflare',
    ])
  })

  it('Opindex shows the "Get" badge on mobile', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [OPINDEX, PHANTOM],
      platform: MOBILE_PLATFORM,
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const opindexButton = screen.getByRole('dialog').querySelector('[data-wallet-id="opindex"]')
    expect(opindexButton?.textContent).toContain('Get')

    const phantomButton = screen.getByRole('dialog').querySelector('[data-wallet-id="phantom"]')
    expect(phantomButton?.textContent).not.toContain('Get')
  })

  it('Opindex shows the "Install" badge on desktop without the extension', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [OPINDEX, PHANTOM],
      platform: DESKTOP_NO_EXTENSION,
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const opindexButton = screen.getByRole('dialog').querySelector('[data-wallet-id="opindex"]')
    expect(opindexButton?.textContent).toContain('Install')
  })

  it('Opindex badge flips from "Install" to "Detected" when the registry registers it late', async () => {
    // Late-registering Opindex: when the Wallet Standard registration
    // lands, the manager re-runs `mergeWalletList` (which sets
    // `isDetected: true` on the matching configured entry), the hook
    // re-renders, and the "Install" badge swaps for "Detected".
    const user = userEvent.setup()
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [OPINDEX, PHANTOM],
      platform: DESKTOP_NO_EXTENSION,
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    let opindexButton = screen.getByRole('dialog').querySelector('[data-wallet-id="opindex"]')
    expect(opindexButton?.textContent).toContain('Install')

    await act(async () => {
      mock.setPlatform(DESKTOP_WITH_OPINDEX)
      mock.setSortedWallets([{ ...OPINDEX, isDetected: true }, PHANTOM])
      mock.notifyRegistryChange()
    })

    opindexButton = screen.getByRole('dialog').querySelector('[data-wallet-id="opindex"]')
    expect(opindexButton?.textContent).not.toContain('Install')
    expect(opindexButton?.textContent).toContain('Detected')
  })

  it('Opindex shows "Detected" on desktop when the extension is registered', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [{ ...OPINDEX, isDetected: true }, PHANTOM],
      platform: DESKTOP_WITH_OPINDEX,
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const opindexButton = screen.getByRole('dialog').querySelector('[data-wallet-id="opindex"]')
    expect(opindexButton?.textContent).not.toContain('Get')
    expect(opindexButton?.textContent).not.toContain('Install')
    expect(opindexButton?.textContent).toContain('Detected')
  })

  it('configured wallet with isDetected: true renders the "Detected" badge', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({
      wallets: [PHANTOM],
      sortedWallets: [{ ...PHANTOM, isDetected: true }],
      platform: {
        isMobile: false,
        isIOS: false,
        isAndroid: false,
        hasExtension: true,
        hasOpindexExtension: false,
        strategy: 'extension',
      },
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const phantom = screen.getByRole('dialog').querySelector('[data-wallet-id="phantom"]')
    expect(phantom?.textContent).toContain('Detected')
    expect(phantom?.textContent).not.toContain('Install')
  })

  it('discovered-only wallet appears with its name + "Detected" badge', async () => {
    const user = userEvent.setup()
    const BACKPACK_DISCOVERED: WalletListEntry = {
      id: 'backpack',
      name: 'Backpack',
      priority: Number.MAX_SAFE_INTEGER,
      icon: 'data:image/svg+xml;base64,BP',
      isDetected: true,
      source: 'discovered',
    }
    const mock = makeMockManager({
      wallets: [PHANTOM],
      sortedWallets: [PHANTOM, BACKPACK_DISCOVERED],
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const backpack = screen.getByRole('dialog').querySelector('[data-wallet-id="backpack"]')
    expect(backpack).not.toBeNull()
    expect(backpack?.textContent).toContain('Backpack')
    expect(backpack?.textContent).toContain('Detected')
  })

  it('non-pinned, non-detected wallet renders without any badge', async () => {
    const user = userEvent.setup()
    // Phantom isn't pinned and isn't detected — should produce no badge
    // (regression guard against the old behavior that suppressed
    // non-pinned install badges).
    const mock = makeMockManager({
      wallets: [PHANTOM],
      sortedWallets: [PHANTOM],
      platform: DESKTOP_NO_EXTENSION,
    })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const phantom = screen.getByRole('dialog').querySelector('[data-wallet-id="phantom"]')
    expect(phantom?.textContent).not.toContain('Install')
    expect(phantom?.textContent).not.toContain('Get')
    expect(phantom?.textContent).not.toContain('Detected')
  })

  it('clicking a wallet calls manager.connect() with the correct walletId', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const phantomItem = screen
      .getByRole('dialog')
      .querySelector('[data-wallet-id="phantom"]') as HTMLButtonElement
    await user.click(phantomItem)

    expect(mock.connectSpy).toHaveBeenCalledTimes(1)
    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('shows connected state with a truncated public key', () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    const fullPubkey = 'ABCD1234567890XYZW'
    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: fullPubkey,
        requireSignIn: false,
      })
    })

    const btn = screen.getByRole('button', { name: /connected as/i })
    // Truncation format: first 4 + ellipsis + last 4.
    expect(btn.textContent).toBe('ABCD…XYZW')
  })

  it('disconnect from the connected modal resets the connected state', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK_ABCD1234',
        requireSignIn: false,
      })
    })

    // Open the connected-mode modal.
    await user.click(screen.getByRole('button', { name: /connected as/i }))
    await user.click(screen.getByRole('button', { name: /^disconnect$/i }))

    expect(mock.disconnectSpy).toHaveBeenCalledTimes(1)
    // After disconnect, the button reverts to the disconnected label.
    expect(screen.getByRole('button', { name: /connect wallet/i })).toBeDefined()
  })

  it('restores focus to the trigger button when the modal closes', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    const trigger = screen.getByRole('button', { name: /connect wallet/i })
    // Simulate a keyboard user landing on the trigger before opening the
    // modal. `userEvent.click` already focuses the element it clicks, but
    // an explicit focus here pins the precondition for the test.
    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await user.click(trigger)
    // On open, focus moves to the first focusable inside the dialog
    // (the Close button per the focus-trap test above).
    expect(document.activeElement).not.toBe(trigger)

    await user.keyboard('{Escape}')

    // After close, focus must return to the trigger — WCAG modal pattern.
    expect(document.activeElement).toBe(trigger)
  })

  it('Escape closes the modal', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))
    expect(screen.getByRole('dialog')).toBeDefined()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('focuses the first focusable element on open', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    // First focusable inside the modal is the Close button (rendered before
    // the wallet list). It should be the active element after open.
    const closeButton = screen.getByRole('button', { name: 'Close' })
    expect(document.activeElement).toBe(closeButton)
  })

  it('traps focus inside the modal — Tab from the last focusable wraps to the first', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const dialog = screen.getByRole('dialog')
    const focusables = within(dialog)
      .getAllByRole('button')
      .filter((b) => !b.hasAttribute('disabled'))
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    last.focus()
    expect(document.activeElement).toBe(last)

    await user.tab()
    expect(document.activeElement).toBe(first)
  })

  it('traps focus inside the modal — Shift+Tab from the first wraps to the last', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    const dialog = screen.getByRole('dialog')
    const focusables = within(dialog)
      .getAllByRole('button')
      .filter((b) => !b.hasAttribute('disabled'))
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    first.focus()
    expect(document.activeElement).toBe(first)

    await user.tab({ shift: true })
    expect(document.activeElement).toBe(last)
  })

  it('clicking the backdrop closes the modal; clicking the dialog body does not', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))
    const dialog = screen.getByRole('dialog')
    // The backdrop is the dialog's parent element.
    const backdrop = dialog.parentElement!

    // Click on the dialog interior — should NOT close.
    await user.click(dialog)
    expect(screen.queryByRole('dialog')).not.toBeNull()

    // Click on the backdrop itself — closes.
    await user.click(backdrop)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('fires onConnected with the publicKey when the flow transitions to connected', () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const onConnected = vi.fn()
    render(<ConnectButton onConnected={onConnected} />, { wrapper: wrap(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: false,
      })
    })

    expect(onConnected).toHaveBeenCalledTimes(1)
    expect(onConnected).toHaveBeenCalledWith('PK')
  })

  it('fires onAuthenticated with publicKey and signature on the authenticated transition', () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const onAuthenticated = vi.fn()
    render(<ConnectButton onAuthenticated={onAuthenticated} />, { wrapper: wrap(mock.manager) })

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: true,
      })
      mock.machine.send({ type: 'SIGN_INITIATED' })
      mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    })

    expect(onAuthenticated).toHaveBeenCalledTimes(1)
    expect(onAuthenticated).toHaveBeenCalledWith('PK', 'sig-b58')
  })

  it('keeps the modal open through `signing` and closes on `authenticated` (requireSignIn flow)', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))
    expect(screen.getByRole('dialog')).toBeDefined()

    // Wallet returns a publicKey, requireSignIn: true → state lands in
    // `connected`, NOT auto-stepped. Modal should still be visible so the
    // user sees the dApp is still doing something while their wallet
    // shows the SIWS prompt.
    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: true,
      })
    })
    expect(screen.queryByRole('dialog')).not.toBeNull()

    // Sign step in progress — modal still open.
    act(() => {
      mock.machine.send({ type: 'SIGN_INITIATED' })
    })
    expect(screen.queryByRole('dialog')).not.toBeNull()

    // Sign completes → terminal `authenticated` state → modal closes.
    act(() => {
      mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('auto-closes the modal on successful connect', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))
    expect(screen.getByRole('dialog')).toBeDefined()

    // Synthesize a successful connect from the manager side.
    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'WALLET_CONNECTED',
        publicKey: 'PK',
        requireSignIn: false,
      })
    })

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders an error row in the modal when the flow lands in error', async () => {
    const user = userEvent.setup()
    const mock = makeMockManager({ wallets: [PHANTOM] })
    render(<ConnectButton />, { wrapper: wrap(mock.manager) })

    await user.click(screen.getByRole('button', { name: /connect wallet/i }))

    act(() => {
      mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
      mock.machine.send({
        type: 'ERROR',
        error: new WalletConnectionError('user rejected'),
      })
    })

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('user rejected')
  })
})
