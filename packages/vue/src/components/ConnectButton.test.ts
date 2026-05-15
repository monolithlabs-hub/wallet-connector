import {
  createFlowMachine,
  type FlowMachine,
  type PlatformInfo,
  type WalletListEntry,
  type WalletManager,
} from '@monolithlabs-hub/wallet-connect-core'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { WalletConnectInjectionKey } from '../context/injection-key'

import ConnectButton from './ConnectButton.vue'

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

// --- Mock manager --------------------------------------------------------

interface MockManager {
  manager: WalletManager
  machine: FlowMachine
  connectSpy: ReturnType<typeof vi.fn>
  disconnectSpy: ReturnType<typeof vi.fn>
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

  let platform: PlatformInfo = opts.platform ?? DESKTOP_NO_EXTENSION
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
    initialize: vi.fn(),
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
    setPlatform: (next) => {
      platform = next
    },
    setSortedWallets: (next) => {
      sorted = next
    },
    notifyRegistryChange: () => notify(),
  }
}

function mountButton(manager: WalletManager, props: Record<string, unknown> = {}): VueWrapper {
  return mount(ConnectButton, {
    props,
    attachTo: document.body,
    global: {
      provide: {
        [WalletConnectInjectionKey as symbol]: manager,
      },
    },
  })
}

// Query helpers — the modal lives in document.body via <Teleport>, so
// the component wrapper's root doesn't contain it. Use raw DOM queries.
function getDialog(): HTMLElement | null {
  return document.body.querySelector('[role="dialog"]')
}

function getWalletButtons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>('[data-wallet-id]'))
}

// The shared setup file's `enableAutoUnmount(afterEach)` clears the
// mounted components; Teleported nodes get torn down with the component,
// so no manual document.body cleanup is needed.

// --- Tests --------------------------------------------------------------

describe('ConnectButton.vue', () => {
  it('renders the "Connect Wallet" button by default', () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    const wrapper = mountButton(mock.manager)

    const btn = wrapper.get('button')
    expect(btn.text()).toBe('Connect Wallet')
    expect(btn.attributes('aria-haspopup')).toBe('dialog')
    expect(btn.attributes('aria-expanded')).toBe('false')
  })

  it('respects a custom label prop', () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager, { label: 'Sign in' })

    expect(wrapper.get('button').text()).toBe('Sign in')
  })

  it('shows the empty state when no wallets are configured', async () => {
    // Edge case for the `v-else` branch in the modal — both wallets-empty
    // AND not-connected. Doubles as documentation of what consumers see
    // if they wire up an empty `wallets` array.
    const mock = makeMockManager({ wallets: [] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    const dialog = getDialog()
    expect(dialog).not.toBeNull()
    expect(dialog?.textContent).toContain('No wallets configured')
  })

  it('clicking the button opens the wallet modal', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    const wrapper = mountButton(mock.manager)

    expect(getDialog()).toBeNull()

    await wrapper.get('button').trigger('click')

    const dialog = getDialog()
    expect(dialog).not.toBeNull()
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('wallet list shows Opindex first on mobile', async () => {
    const mock = makeMockManager({
      wallets: [PHANTOM, SOLFLARE, OPINDEX],
      sortedWallets: [OPINDEX, PHANTOM, SOLFLARE],
      platform: MOBILE_PLATFORM,
    })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')

    const ids = getWalletButtons().map((b) => b.getAttribute('data-wallet-id'))
    expect(ids).toEqual(['opindex', 'phantom', 'solflare'])
  })

  it('Opindex shows the "Get" badge on mobile', async () => {
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [OPINDEX, PHANTOM],
      platform: MOBILE_PLATFORM,
    })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')

    const opindex = document.body.querySelector('[data-wallet-id="opindex"]')
    expect(opindex?.textContent).toContain('Get')

    const phantom = document.body.querySelector('[data-wallet-id="phantom"]')
    expect(phantom?.textContent).not.toContain('Get')
  })

  it('Opindex shows the "Install" badge on desktop without the extension', async () => {
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [OPINDEX, PHANTOM],
      platform: DESKTOP_NO_EXTENSION,
    })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')

    const opindex = document.body.querySelector('[data-wallet-id="opindex"]')
    expect(opindex?.textContent).toContain('Install')
  })

  it('Opindex badge flips from "Install" to "Detected" when the registry registers it late', async () => {
    // Late-registering Opindex: when the Wallet Standard registration
    // lands, `mergeWalletList` flips `isDetected: true` on the matching
    // configured entry, the composable's subscribe callback re-pulls
    // sortedWallets, and the "Install" badge swaps for "Detected".
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [OPINDEX, PHANTOM],
      platform: DESKTOP_NO_EXTENSION,
    })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')

    let opindex = document.body.querySelector('[data-wallet-id="opindex"]')
    expect(opindex?.textContent).toContain('Install')

    mock.setPlatform(DESKTOP_WITH_OPINDEX)
    mock.setSortedWallets([{ ...OPINDEX, isDetected: true }, PHANTOM])
    mock.notifyRegistryChange()
    await nextTick()

    opindex = document.body.querySelector('[data-wallet-id="opindex"]')
    expect(opindex?.textContent).not.toContain('Install')
    expect(opindex?.textContent).toContain('Detected')
  })

  it('Opindex shows "Detected" on desktop when the extension is registered', async () => {
    const mock = makeMockManager({
      wallets: [OPINDEX, PHANTOM],
      sortedWallets: [{ ...OPINDEX, isDetected: true }, PHANTOM],
      platform: DESKTOP_WITH_OPINDEX,
    })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')

    const opindex = document.body.querySelector('[data-wallet-id="opindex"]')
    expect(opindex?.textContent).not.toContain('Get')
    expect(opindex?.textContent).not.toContain('Install')
    expect(opindex?.textContent).toContain('Detected')
  })

  it('configured wallet with isDetected: true renders the "Detected" badge', async () => {
    const mock = makeMockManager({
      wallets: [PHANTOM],
      sortedWallets: [{ ...PHANTOM, isDetected: true }],
    })
    const wrapper = mountButton(mock.manager)
    await wrapper.get('button').trigger('click')

    const phantom = document.body.querySelector('[data-wallet-id="phantom"]')
    expect(phantom?.textContent).toContain('Detected')
    expect(phantom?.textContent).not.toContain('Install')
  })

  it('discovered-only wallet appears with its name + "Detected" badge', async () => {
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
    const wrapper = mountButton(mock.manager)
    await wrapper.get('button').trigger('click')

    const backpack = document.body.querySelector('[data-wallet-id="backpack"]')
    expect(backpack).not.toBeNull()
    expect(backpack?.textContent).toContain('Backpack')
    expect(backpack?.textContent).toContain('Detected')
  })

  it('non-pinned, non-detected wallet renders without any badge', async () => {
    const mock = makeMockManager({
      wallets: [PHANTOM],
      sortedWallets: [PHANTOM],
      platform: DESKTOP_NO_EXTENSION,
    })
    const wrapper = mountButton(mock.manager)
    await wrapper.get('button').trigger('click')

    const phantom = document.body.querySelector('[data-wallet-id="phantom"]')
    expect(phantom?.textContent).not.toContain('Install')
    expect(phantom?.textContent).not.toContain('Get')
    expect(phantom?.textContent).not.toContain('Detected')
  })

  it('clicking a wallet calls wallet.connect() with the correct walletId', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')

    const phantom = document.body.querySelector<HTMLButtonElement>('[data-wallet-id="phantom"]')!
    phantom.click()
    await flushPromises()

    expect(mock.connectSpy).toHaveBeenCalledTimes(1)
    expect(mock.connectSpy).toHaveBeenCalledWith('phantom')
  })

  it('shows connected state with a truncated public key', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    const fullPubkey = 'ABCD1234567890XYZW'
    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: fullPubkey,
      requireSignIn: false,
    })
    await nextTick()

    const btn = wrapper.get('button')
    // Truncation: first 4 + ellipsis + last 4.
    expect(btn.text()).toBe('ABCD…XYZW')
    expect(btn.attributes('aria-label')).toContain(
      'Connected as ABCD…XYZW'.replace('Connected', 'connected'),
    )
  })

  it('disconnect from the connected modal resets the connected state', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK_ABCD1234',
      requireSignIn: false,
    })
    await nextTick()

    // Open the connected modal.
    await wrapper.get('button').trigger('click')

    const disconnectBtn = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button'),
    ).find((b) => b.textContent?.trim() === 'Disconnect')
    expect(disconnectBtn).toBeDefined()

    disconnectBtn!.click()
    // Two awaits because two async hops:
    //   1. flushPromises — resolves the `await disconnect()` inside
    //      `handleDisconnect` and lets `open.value = false` run.
    //   2. nextTick — flushes Vue's reactive effects (the watch on
    //      `open` removing the keydown listener, the template re-render
    //      that reverts the trigger button text).
    await flushPromises()
    await nextTick()

    expect(mock.disconnectSpy).toHaveBeenCalledTimes(1)
    expect(wrapper.get('button').text()).toBe('Connect Wallet')
  })

  it('Escape closes the modal', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    expect(getDialog()).not.toBeNull()

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()
    expect(getDialog()).toBeNull()
  })

  it('focuses the first focusable element on open', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    await nextTick()

    // First focusable inside the modal is the Close button.
    const close = document.body.querySelector<HTMLButtonElement>(
      '[role="dialog"] button[aria-label="Close"]',
    )
    expect(close).not.toBeNull()
    expect(document.activeElement).toBe(close)
  })

  it('restores focus to the trigger when the modal closes', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)
    const trigger = wrapper.get('button').element as HTMLButtonElement

    trigger.focus()
    expect(document.activeElement).toBe(trigger)

    await wrapper.get('button').trigger('click')
    await nextTick()
    // Focus has moved into the dialog by now.
    expect(document.activeElement).not.toBe(trigger)

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextTick()

    expect(document.activeElement).toBe(trigger)
  })

  it('traps focus inside the modal — Tab from the last focusable wraps to the first', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    await nextTick()

    const focusables = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not([disabled])'),
    )
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    last.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    await nextTick()
    expect(document.activeElement).toBe(first)
  })

  it('traps focus inside the modal — Shift+Tab from the first wraps to the last', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM, SOLFLARE] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    await nextTick()

    const focusables = Array.from(
      document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button:not([disabled])'),
    )
    const first = focusables[0]!
    const last = focusables[focusables.length - 1]!

    first.focus()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true }))
    await nextTick()
    expect(document.activeElement).toBe(last)
  })

  it('clicking the backdrop closes the modal; clicking the dialog body does not', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    const dialog = getDialog() as HTMLElement
    const backdrop = dialog.parentElement!

    // Click inside the dialog — should NOT close.
    dialog.click()
    await nextTick()
    expect(getDialog()).not.toBeNull()

    // Click backdrop — closes.
    backdrop.click()
    await nextTick()
    expect(getDialog()).toBeNull()
  })

  it('emits connected with the publicKey when the flow transitions to connected', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK',
      requireSignIn: false,
    })
    await nextTick()

    expect(wrapper.emitted('connected')).toHaveLength(1)
    expect(wrapper.emitted('connected')?.[0]).toEqual(['PK'])
  })

  it('emits authenticated with publicKey and signature on the authenticated transition', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK',
      requireSignIn: true,
    })
    mock.machine.send({ type: 'SIGN_INITIATED' })
    mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    await nextTick()

    expect(wrapper.emitted('authenticated')).toHaveLength(1)
    expect(wrapper.emitted('authenticated')?.[0]).toEqual(['PK', 'sig-b58'])
  })

  it('keeps the modal open through `signing` and closes on `authenticated`', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    expect(getDialog()).not.toBeNull()

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK',
      requireSignIn: true,
    })
    await nextTick()
    expect(getDialog()).not.toBeNull()

    mock.machine.send({ type: 'SIGN_INITIATED' })
    await nextTick()
    expect(getDialog()).not.toBeNull()

    mock.machine.send({ type: 'SIGN_COMPLETED', signature: 'sig-b58' })
    await nextTick()
    expect(getDialog()).toBeNull()
  })

  it('auto-closes the modal on successful (non-SIWS) connect', async () => {
    const mock = makeMockManager({ wallets: [PHANTOM] })
    const wrapper = mountButton(mock.manager)

    await wrapper.get('button').trigger('click')
    expect(getDialog()).not.toBeNull()

    mock.machine.send({ type: 'CONNECT_INITIATED', walletId: 'phantom' })
    mock.machine.send({
      type: 'WALLET_CONNECTED',
      publicKey: 'PK',
      requireSignIn: false,
    })
    await nextTick()

    expect(getDialog()).toBeNull()
  })
})
