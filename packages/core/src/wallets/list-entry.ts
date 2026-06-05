import type { StandardWalletAdapter } from '../adapters/standard-wallet-adapter'
import { asWalletName, type WalletName } from '../wallet-name'

import type { WalletConfig } from './sorter'

/**
 * Display-ready wallet entry produced by {@link mergeWalletList}. Carries
 * both the consumer-supplied {@link WalletConfig} fields AND runtime
 * metadata derived from the Wallet Standard registry (`isDetected`,
 * `source`, the discovered icon).
 *
 * Two flavours, distinguished by `source`:
 *
 * - `'configured'` — the consumer listed this wallet in
 *   `WalletManagerConfig.wallets`. All mobile deep-link fields
 *   (`deepLinkScheme` / `universalLink` / `appStoreUrl` / `playStoreUrl`)
 *   are present, copied from the source `WalletConfig`.
 * - `'discovered'` — the wallet is registered with the Wallet Standard
 *   registry but NOT in `wallets[]`. The deep-link fields are absent.
 *   These entries only appear on the `extension` strategy (discovery
 *   doesn't run on the mobile `deeplink` strategy), so the missing
 *   deep-link metadata is never read in practice.
 *
 * The shape is flat, not a discriminated union, so renderers can read
 * `name` / `icon` / `priority` without first branching on `source`.
 */
export interface WalletListEntry {
  /** Stable identifier — `WalletConfig.id` for configured entries, slugified `wallet.name` for discovered-only. */
  id: string
  /** Human-readable label shown in the modal. */
  name: string
  /**
   * URL or data URI for the wallet's logo. Resolution priority:
   * 1. `WalletConfig.icon` if non-empty (consumer-provided wins).
   * 2. The matched `StandardWalletAdapter.wallet.icon` (data URI from the spec).
   * 3. `''` — caller must fall back (placeholder, initial-letter avatar, etc.).
   */
  icon: string
  /** Lower numbers sort earlier. Configured: `WalletConfig.priority`. Discovered-only: `Number.MAX_SAFE_INTEGER` (sorts last). */
  priority: number
  /** `true` iff a matching `StandardWalletAdapter` exists in the registry — drives the "Detected" badge. */
  isDetected: boolean
  /** Provenance of the entry. */
  source: 'configured' | 'discovered'
  /** Custom URL scheme (e.g., `phantom://`) — present only on configured entries. */
  deepLinkScheme?: string
  /** HTTPS universal link (e.g., `https://phantom.app/ul/v1/connect`) — present only on configured entries. */
  universalLink?: string
  /** iOS App Store URL — present only on configured entries. */
  appStoreUrl?: string
  /** Google Play URL — present only on configured entries. */
  playStoreUrl?: string
  /** Mobile download / landing page (e.g. `https://opindex.deeptap.io`) — present only on configured entries that set it. */
  installUrl?: string
  /** Desktop browser-extension install page (e.g. Chrome Web Store) — present only on configured entries that set it. */
  extensionUrl?: string
  /** Wallet Standard registration name — populated for any entry that matched (configured) or originated from (discovered) a registered wallet. */
  standardName?: WalletName
}

/**
 * Slugify a wallet name for use as a stable id. Lowercases, replaces any
 * run of non-alphanumeric characters with a single dash, and trims
 * leading/trailing dashes.
 *
 * Examples:
 * - `'Backpack'` → `'backpack'`
 * - `'@solana/wallet'` → `'solana-wallet'`
 * - `'  Trust Wallet  '` → `'trust-wallet'`
 *
 * Returns the input lowercased (with non-alphanumerics dropped to dashes)
 * when no characters survive the filter, an empty string is returned —
 * callers should treat an empty slug as "ineligible for discovered-only
 * surfacing" (the merge skips it).
 */
export function walletNameSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * {@link walletNameSlug} with a trailing `-wallet` segment stripped, so the
 * extremely common "X" vs "X Wallet" registration variance collapses to one
 * key. Used for matching a {@link WalletConfig} against a Wallet Standard
 * registration name when no explicit `standardName` is set.
 *
 * Examples:
 * - `'Opindex'` → `'opindex'`, `'Opindex Wallet'` → `'opindex'` (they merge)
 * - `'Trust Wallet'` → `'trust'`, `'Trust'` → `'trust'`
 * - `'Wallet'` → `'wallet'` (a bare "Wallet" is NOT stripped to empty)
 *
 * The trailing-word strip is deliberately conservative: it only removes a
 * final `-wallet` token, never an interior one, so distinct wallets like
 * `'Phantom'` and `'Opindex'` never collide.
 */
export function normalizeWalletName(name: string): string {
  const slug = walletNameSlug(name)
  const stripped = slug.replace(/-wallet$/, '')
  return stripped === '' ? slug : stripped
}

/**
 * Merge the consumer's `WalletConfig[]` with the live
 * `StandardWalletAdapter[]` from {@link discoverStandardWallets}.
 *
 * Matching rules (per configured wallet):
 * 1. Exact match on `WalletConfig.standardName === adapter.wallet.name`.
 * 2. Fallback: case-insensitive `WalletConfig.name` against `adapter.wallet.name`.
 *
 * Matched configured wallets get `isDetected: true` and (if the consumer
 * didn't supply one) the discovered icon. Adapters that didn't match any
 * configured wallet are emitted as `source: 'discovered'` entries at the
 * tail of the list, with `priority: Number.MAX_SAFE_INTEGER` so they sort
 * after every configured wallet.
 *
 * Defensive: a discovered-only entry whose slug collides with an already
 * emitted configured `id` is dropped (would manifest only if the consumer
 * picks the same id as the wallet's slug *and* the wallet didn't match by
 * standardName/name — vanishingly unlikely, but harmless to guard).
 *
 * Pure — never mutates the inputs. SSR-safe — pass an empty `adapters`
 * array (this is what `WalletManager.getSortedWallets()` does when
 * `discoveryHandle` is null on `deeplink` / `install-prompt` strategies).
 */
export function mergeWalletList(
  configured: readonly WalletConfig[],
  adapters: readonly StandardWalletAdapter[],
): WalletListEntry[] {
  const matched = new Set<StandardWalletAdapter>()
  const out: WalletListEntry[] = []
  const usedIds = new Set<string>()

  for (const config of configured) {
    const adapter = findAdapterFor(config, adapters)
    if (adapter) matched.add(adapter)
    out.push(toConfiguredEntry(config, adapter))
    usedIds.add(config.id)
  }

  for (const adapter of adapters) {
    if (matched.has(adapter)) continue
    const slug = walletNameSlug(adapter.wallet.name)
    if (slug === '') continue
    if (usedIds.has(slug)) continue
    out.push(toDiscoveredEntry(adapter, slug))
    usedIds.add(slug)
  }

  return out
}

function findAdapterFor(
  config: WalletConfig,
  adapters: readonly StandardWalletAdapter[],
): StandardWalletAdapter | null {
  if (config.standardName !== undefined) {
    const byStandardName = adapters.find((a) => a.wallet.name === config.standardName)
    if (byStandardName) return byStandardName
  }
  // Normalized match tolerates the common "X" vs "X Wallet" registration
  // variance (e.g. configured 'Opindex' vs registered 'Opindex Wallet'), so
  // the two collapse into a single detected entry instead of duplicating.
  const target = normalizeWalletName(config.name)
  return adapters.find((a) => normalizeWalletName(a.wallet.name) === target) ?? null
}

function toConfiguredEntry(
  config: WalletConfig,
  adapter: StandardWalletAdapter | null,
): WalletListEntry {
  const discoveredIcon = adapter?.wallet.icon ?? ''
  // When the wallet is actually detected via Wallet Standard, prefer the live
  // registry branding (icon + name) — it reflects the installed wallet the
  // user recognizes (e.g. the colorful "Opindex Wallet" logo) rather than the
  // dapp's generic placeholder. Falls back to the configured values when the
  // registry doesn't provide them, or when the wallet isn't detected.
  const entry: WalletListEntry = {
    id: config.id,
    name: adapter ? adapter.wallet.name : config.name,
    icon: adapter ? discoveredIcon || config.icon : config.icon || discoveredIcon,
    priority: config.priority,
    isDetected: adapter !== null,
    source: 'configured',
    // Optional deep-link / install fields are spread conditionally so an
    // unset field stays *absent* rather than `undefined` — required under
    // the project's `exactOptionalPropertyTypes`.
    ...(config.deepLinkScheme !== undefined && { deepLinkScheme: config.deepLinkScheme }),
    ...(config.universalLink !== undefined && { universalLink: config.universalLink }),
    ...(config.appStoreUrl !== undefined && { appStoreUrl: config.appStoreUrl }),
    ...(config.playStoreUrl !== undefined && { playStoreUrl: config.playStoreUrl }),
    ...(config.installUrl !== undefined && { installUrl: config.installUrl }),
    ...(config.extensionUrl !== undefined && { extensionUrl: config.extensionUrl }),
  }
  // standardName is preserved when present on the config OR derivable from a
  // matched adapter — gives consumers a stable Wallet-Standard handle even
  // when they omitted standardName in their config.
  if (config.standardName !== undefined) {
    entry.standardName = config.standardName
  } else if (adapter) {
    entry.standardName = asWalletName(adapter.wallet.name)
  }
  return entry
}

function toDiscoveredEntry(adapter: StandardWalletAdapter, slug: string): WalletListEntry {
  return {
    id: slug,
    name: adapter.wallet.name,
    icon: adapter.wallet.icon ?? '',
    priority: Number.MAX_SAFE_INTEGER,
    isDetected: true,
    source: 'discovered',
    standardName: asWalletName(adapter.wallet.name),
  }
}
