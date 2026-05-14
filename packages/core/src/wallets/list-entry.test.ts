import { describe, expect, it } from 'vitest'

import type { StandardWalletAdapter } from '../adapters/standard-wallet-adapter'
import { asWalletName } from '../wallet-name'

import { mergeWalletList, walletNameSlug } from './list-entry'
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

describe('mergeWalletList', () => {
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

  it('configured icon wins over the adapter icon when both are present', () => {
    const config: WalletConfig = { ...phantom, icon: 'https://example.com/phantom.png' }
    const adapter = makeAdapter('Phantom', 'data:image/svg+xml;base64,DISCOVERED')

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
