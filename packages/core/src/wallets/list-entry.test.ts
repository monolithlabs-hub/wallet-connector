import { describe, expect, it } from 'vitest'

import type { StandardWalletAdapter } from '../adapters/standard-wallet-adapter'
import { asWalletName } from '../wallet-name'

import { mergeWalletList, normalizeWalletName, walletNameSlug } from './list-entry'
import type { WalletConfig } from './sorter'

const stubMeta = {
  icon: '',
  deepLinkScheme: '',
  universalLink: '',
  appStoreUrl: '',
  playStoreUrl: '',
} as const

const opindex: WalletConfig = { id: 'opindex', name: 'Opindex', priority: 10, ...stubMeta }
const phantom: WalletConfig = { id: 'phantom', name: 'Phantom', priority: 1, ...stubMeta }
const solflare: WalletConfig = {
  id: 'solflare',
  name: 'Solflare',
  priority: 2,
  ...stubMeta,
  standardName: asWalletName('Solflare'),
}

function makeAdapter(
  name: string,
  icon = `data:image/svg+xml;base64,${name}`,
): StandardWalletAdapter {
  return {
    wallet: { name, icon },
  } as unknown as StandardWalletAdapter
}

describe('walletNameSlug', () => {
  it('lowercases and dashifies', () => {
    expect(walletNameSlug('Phantom')).toBe('phantom')
    expect(walletNameSlug('Coinbase Wallet')).toBe('coinbase-wallet')
  })

  it('collapses runs of non-alphanumerics to single dashes', () => {
    expect(walletNameSlug('@solana/wallet')).toBe('solana-wallet')
    expect(walletNameSlug('a !! b')).toBe('a-b')
  })

  it('trims leading and trailing dashes', () => {
    expect(walletNameSlug('  Trust Wallet  ')).toBe('trust-wallet')
    expect(walletNameSlug('---X---')).toBe('x')
  })

  it('returns empty string for input with no alphanumerics', () => {
    expect(walletNameSlug('!!!')).toBe('')
    expect(walletNameSlug('')).toBe('')
  })
})

describe('normalizeWalletName', () => {
  it('collapses the "X" vs "X Wallet" variance to one key', () => {
    expect(normalizeWalletName('Opindex')).toBe('opindex')
    expect(normalizeWalletName('Opindex Wallet')).toBe('opindex')
    expect(normalizeWalletName('Trust')).toBe('trust')
    expect(normalizeWalletName('Trust Wallet')).toBe('trust')
  })

  it('does not strip a bare "Wallet" down to empty', () => {
    expect(normalizeWalletName('Wallet')).toBe('wallet')
  })

  it('only strips a trailing wallet token, never an interior one', () => {
    expect(normalizeWalletName('Wallet Connect')).toBe('wallet-connect')
    // Distinct wallets must never normalize to the same key.
    expect(normalizeWalletName('Phantom')).not.toBe(normalizeWalletName('Opindex'))
  })
})

describe('mergeWalletList', () => {
  it('merges configured "Opindex" with discovered "Opindex Wallet" into one detected entry', () => {
    // The exact opin.art bug: configured 'Opindex' (no standardName) + the
    // in-app registry name 'Opindex Wallet' must collapse to a single
    // detected, configured row — not two rows.
    const adapter = makeAdapter('Opindex Wallet', 'data:image/svg+xml;base64,OPINDEX')

    const result = mergeWalletList([opindex], [adapter])

    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      id: 'opindex',
      name: 'Opindex Wallet',
      icon: 'data:image/svg+xml;base64,OPINDEX',
      isDetected: true,
      source: 'configured',
    })
  })

  it('does NOT over-merge distinct wallets (Opindex must not absorb "Phantom Wallet")', () => {
    const adapter = makeAdapter('Phantom Wallet')

    const result = mergeWalletList([opindex], [adapter])

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'opindex', isDetected: false })
    expect(result[1]).toMatchObject({ source: 'discovered', name: 'Phantom Wallet' })
  })

  it('returns an empty list when both inputs are empty', () => {
    expect(mergeWalletList([], [])).toEqual([])
  })

  it('emits configured-only entries when no adapters match', () => {
    const result = mergeWalletList([phantom, solflare], [])

    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'phantom', isDetected: false, source: 'configured' })
    expect(result[1]).toMatchObject({ id: 'solflare', isDetected: false, source: 'configured' })
  })

  it('matches a configured wallet against an adapter by standardName first', () => {
    // Config carries standardName: 'Solflare' — matches even if `name` differs.
    const config: WalletConfig = {
      ...stubMeta,
      id: 'sf',
      name: 'Something Else',
      priority: 5,
      standardName: asWalletName('Solflare'),
    }
    const adapter = makeAdapter('Solflare')

    const [entry] = mergeWalletList([config], [adapter])

    expect(entry).toMatchObject({ id: 'sf', isDetected: true, source: 'configured' })
  })

  it('falls back to case-insensitive name matching when standardName is absent', () => {
    const adapter = makeAdapter('phantom') // lowercase

    const [entry] = mergeWalletList([phantom], [adapter])

    expect(entry?.isDetected).toBe(true)
  })

  it('prefers the detected adapter icon over the configured icon when detected', () => {
    // When a wallet is actually installed, show its live registry branding so
    // the user sees the logo they recognize (decided UX) — not the dapp's
    // generic placeholder icon.
    const config: WalletConfig = { ...phantom, icon: 'https://example.com/phantom.png' }
    const adapter = makeAdapter('Phantom', 'data:image/svg+xml;base64,DISCOVERED')

    const [entry] = mergeWalletList([config], [adapter])

    expect(entry?.icon).toBe('data:image/svg+xml;base64,DISCOVERED')
  })

  it('prefers the detected adapter name over the configured name when detected', () => {
    const config: WalletConfig = { ...stubMeta, id: 'opindex', name: 'Opindex', priority: 1 }
    const adapter = makeAdapter('Opindex Wallet')

    const [entry] = mergeWalletList([config], [adapter])

    expect(entry).toMatchObject({ id: 'opindex', name: 'Opindex Wallet', isDetected: true })
  })

  it('keeps the configured icon when the detected adapter has no icon', () => {
    const config: WalletConfig = { ...phantom, icon: 'https://example.com/phantom.png' }
    const adapter = makeAdapter('Phantom', '')

    const [entry] = mergeWalletList([config], [adapter])

    expect(entry?.icon).toBe('https://example.com/phantom.png')
  })

  it('falls back to the adapter icon when the configured icon is empty', () => {
    const adapter = makeAdapter('Phantom', 'data:image/svg+xml;base64,DISCOVERED')

    const [entry] = mergeWalletList([phantom], [adapter])

    expect(entry?.icon).toBe('data:image/svg+xml;base64,DISCOVERED')
  })

  it('derives standardName from the matched adapter when the config omits it', () => {
    const adapter = makeAdapter('Phantom')

    const [entry] = mergeWalletList([phantom], [adapter])

    expect(entry?.standardName).toBe('Phantom')
  })

  it('preserves the configured standardName even when an adapter matches', () => {
    const adapter = makeAdapter('Solflare')

    const [entry] = mergeWalletList([solflare], [adapter])

    expect(entry?.standardName).toBe('Solflare')
  })

  it('emits a discovered-only entry for an adapter not in the config', () => {
    const adapter = makeAdapter('Backpack', 'data:image/svg+xml;base64,BACKPACK')

    const result = mergeWalletList([phantom], [adapter])

    expect(result).toHaveLength(2)
    expect(result[1]).toMatchObject({
      id: 'backpack',
      name: 'Backpack',
      icon: 'data:image/svg+xml;base64,BACKPACK',
      isDetected: true,
      source: 'discovered',
      standardName: 'Backpack',
    })
  })

  it('discovered-only entries get Number.MAX_SAFE_INTEGER priority (sort last)', () => {
    const adapter = makeAdapter('Backpack')

    const [, discovered] = mergeWalletList([phantom], [adapter])

    expect(discovered?.priority).toBe(Number.MAX_SAFE_INTEGER)
  })

  it('discovered-only entries do NOT carry deep-link metadata fields', () => {
    const adapter = makeAdapter('Backpack')

    const [, discovered] = mergeWalletList([phantom], [adapter])

    expect(discovered?.deepLinkScheme).toBeUndefined()
    expect(discovered?.universalLink).toBeUndefined()
    expect(discovered?.appStoreUrl).toBeUndefined()
    expect(discovered?.playStoreUrl).toBeUndefined()
  })

  it('does not double-emit a wallet matched by standardName as a discovered entry', () => {
    // The adapter would otherwise slug to 'phantom' and collide.
    const adapter = makeAdapter('Phantom')

    const result = mergeWalletList([phantom], [adapter])

    expect(result).toHaveLength(1)
    expect(result[0]?.source).toBe('configured')
  })

  it('drops a discovered entry whose slug collides with an emitted configured id', () => {
    // Configured wallet 'opindex' (no matching adapter) + an adapter
    // named 'Opindex' that wouldn't match by name/standardName … but the
    // slug WOULD collide. Real world: case-insensitive name match catches
    // this first. Force the edge by giving the adapter a name that slugs
    // to 'opindex' but doesn't match the configured wallet's name.
    const adapter = makeAdapter('OP-Index') // slug = 'op-index'
    const config: WalletConfig = { ...opindex, id: 'op-index', name: 'My Custom Wallet' }

    const result = mergeWalletList([config], [adapter])

    // 'op-index' configured emitted; discovered slug 'op-index' collides and is skipped.
    expect(result).toHaveLength(1)
    expect(result[0]?.source).toBe('configured')
  })

  it('skips a discovered adapter whose name slugs to an empty string', () => {
    const adapter = makeAdapter('!!!')

    const result = mergeWalletList([], [adapter])

    expect(result).toEqual([])
  })

  it('does not mutate the input arrays', () => {
    const configured: WalletConfig[] = [phantom, solflare]
    const configuredSnapshot = [...configured]
    const adapter = makeAdapter('Backpack')
    const adapters: StandardWalletAdapter[] = [adapter]
    const adaptersSnapshot = [...adapters]

    mergeWalletList(configured, adapters)

    expect(configured).toEqual(configuredSnapshot)
    expect(adapters).toEqual(adaptersSnapshot)
  })

  it('preserves the input order of configured wallets', () => {
    // The sorter (TASK-602) handles sorting; mergeWalletList just yields
    // configured-first-in-input-order then discovered-at-the-tail.
    const result = mergeWalletList([opindex, phantom, solflare], [])

    expect(result.map((e) => e.id)).toEqual(['opindex', 'phantom', 'solflare'])
  })
})
