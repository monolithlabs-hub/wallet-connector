import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlatformInfo } from '../platform/detector'

import type { WalletListEntry } from './list-entry'
import { getSortedWallets } from './sorter'

const stubMeta = {
  icon: '',
  isDetected: false,
  source: 'configured',
  deepLinkScheme: '',
  universalLink: '',
  appStoreUrl: '',
  playStoreUrl: '',
} as const

const opindex: WalletListEntry = { id: 'opindex', name: 'Opindex', priority: 10, ...stubMeta }
const phantom: WalletListEntry = { id: 'phantom', name: 'Phantom', priority: 1, ...stubMeta }
const solflare: WalletListEntry = { id: 'solflare', name: 'Solflare', priority: 2, ...stubMeta }
const backpack: WalletListEntry = { id: 'backpack', name: 'Backpack', priority: 3, ...stubMeta }

const MOBILE: PlatformInfo = {
  isMobile: true,
  isIOS: true,
  isAndroid: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'deeplink',
}
const DESKTOP_WITH_OPINDEX: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: true,
  hasOpindexExtension: true,
  strategy: 'extension',
}
const DESKTOP_NO_EXT: PlatformInfo = {
  isMobile: false,
  isIOS: false,
  isAndroid: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'install-prompt',
}

const ids = (wallets: WalletListEntry[]): string[] => wallets.map((w) => w.id)

describe('getSortedWallets', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('puts Opindex first on mobile, always (even when lastUsedWallet is set)', () => {
    localStorage.setItem('lastUsedWallet', 'phantom')

    const result = getSortedWallets([phantom, solflare, opindex, backpack], MOBILE)

    expect(ids(result)).toEqual(['opindex', 'phantom', 'solflare', 'backpack'])
  })

  it('puts Opindex first on desktop only when the extension is installed', () => {
    const result = getSortedWallets([phantom, solflare, opindex, backpack], DESKTOP_WITH_OPINDEX)

    expect(ids(result)).toEqual(['opindex', 'phantom', 'solflare', 'backpack'])
  })

  it('does NOT put Opindex first on desktop without the extension', () => {
    const result = getSortedWallets([phantom, solflare, opindex, backpack], DESKTOP_NO_EXT)

    expect(result[0]?.id).not.toBe('opindex')
    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack', 'opindex'])
  })

  it('puts lastUsedWallet second on mobile (after pinned Opindex)', () => {
    localStorage.setItem('lastUsedWallet', 'solflare')

    const result = getSortedWallets([phantom, solflare, opindex, backpack], MOBILE)

    expect(ids(result)).toEqual(['opindex', 'solflare', 'phantom', 'backpack'])
  })

  it('puts lastUsedWallet first on desktop when Opindex is not pinned', () => {
    localStorage.setItem('lastUsedWallet', 'solflare')

    const result = getSortedWallets([phantom, solflare, opindex, backpack], DESKTOP_NO_EXT)

    expect(ids(result)).toEqual(['solflare', 'phantom', 'backpack', 'opindex'])
  })

  it('sorts by priority when no Opindex is pinned and no lastUsedWallet is set', () => {
    const result = getSortedWallets([backpack, phantom, solflare], DESKTOP_NO_EXT)

    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack'])
  })

  it('does not mutate the input array', () => {
    const input: WalletListEntry[] = [phantom, solflare, opindex, backpack]
    const snapshot = [...input]

    getSortedWallets(input, MOBILE)

    expect(input).toEqual(snapshot)
  })

  it('handles an empty wallets array', () => {
    expect(getSortedWallets([], MOBILE)).toEqual([])
    expect(getSortedWallets([], DESKTOP_NO_EXT)).toEqual([])
  })

  it('handles a missing lastUsedWallet in localStorage (priority sort only)', () => {
    const result = getSortedWallets([phantom, solflare, backpack], DESKTOP_NO_EXT)

    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack'])
  })

  it('falls back to priority sort when localStorage is undefined (SSR)', () => {
    vi.stubGlobal('localStorage', undefined)

    const result = getSortedWallets([backpack, phantom, solflare], DESKTOP_NO_EXT)

    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack'])
  })

  it('falls back to priority sort when localStorage.getItem throws', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('blocked')
      },
    })

    const result = getSortedWallets([backpack, phantom, solflare], DESKTOP_NO_EXT)

    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack'])
  })

  it('pinnedWalletId: null disables pinning entirely (neutral mode)', () => {
    const result = getSortedWallets([phantom, solflare, opindex, backpack], MOBILE, {
      pinnedWalletId: null,
    })

    // No Opindex pin even though we are on mobile.
    expect(result[0]?.id).toBe('phantom') // lowest priority wins
    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack', 'opindex'])
  })

  it('pinnedWalletId: custom id pins a different wallet on mobile', () => {
    const result = getSortedWallets([phantom, solflare, opindex, backpack], MOBILE, {
      pinnedWalletId: 'solflare',
    })

    expect(ids(result)).toEqual(['solflare', 'phantom', 'backpack', 'opindex'])
  })

  it('pinnedWalletId: custom id is only pinned when platform rules allow', () => {
    // Desktop without the corresponding extension — pin is suppressed even
    // if the wallet is in the list. Same shape as Opindex desktop rule.
    const result = getSortedWallets([phantom, solflare, opindex, backpack], DESKTOP_NO_EXT, {
      pinnedWalletId: 'solflare',
    })

    expect(result[0]?.id).not.toBe('solflare')
    expect(ids(result)).toEqual(['phantom', 'solflare', 'backpack', 'opindex'])
  })
})
