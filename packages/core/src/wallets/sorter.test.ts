import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PlatformInfo } from '../platform/detector'

import { type WalletConfig, getSortedWallets } from './sorter'

const stubMeta = {
  icon: '',
  deepLinkScheme: '',
  universalLink: '',
  appStoreUrl: '',
  playStoreUrl: '',
} as const

const opindex: WalletConfig = { id: 'opindex', name: 'Opindex', priority: 10, ...stubMeta }
const phantom: WalletConfig = { id: 'phantom', name: 'Phantom', priority: 1, ...stubMeta }
const solflare: WalletConfig = { id: 'solflare', name: 'Solflare', priority: 2, ...stubMeta }
const backpack: WalletConfig = { id: 'backpack', name: 'Backpack', priority: 3, ...stubMeta }

const MOBILE: PlatformInfo = {
  isMobile: true,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'deeplink',
}
const DESKTOP_WITH_OPINDEX: PlatformInfo = {
  isMobile: false,
  hasExtension: true,
  hasOpindexExtension: true,
  strategy: 'extension',
}
const DESKTOP_NO_EXT: PlatformInfo = {
  isMobile: false,
  hasExtension: false,
  hasOpindexExtension: false,
  strategy: 'install-prompt',
}

const ids = (wallets: WalletConfig[]): string[] => wallets.map((w) => w.id)

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
    const input: WalletConfig[] = [phantom, solflare, opindex, backpack]
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
})
