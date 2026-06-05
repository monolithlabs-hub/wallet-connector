import type { PlatformInfo } from '../platform/detector'
import { getLastUsedWallet } from '../session/store'
import type { WalletName } from '../wallet-name'

import type { WalletListEntry } from './list-entry'

/**
 * Display metadata for a single wallet shown in the connect UI. The library
 * treats `id === 'opindex'` as the pin target on mobile and on
 * desktop-with-extension (see {@link getSortedWallets}); change
 * `pinnedWallet` in the `WalletManager` config to opt out.
 */
export interface WalletConfig {
  /** Stable identifier — used for last-used tracking and Opindex pinning. */
  id: string
  /** Human-readable label shown in the modal. */
  name: string
  /** Lower numbers sort earlier among non-pinned wallets. */
  priority: number
  /** URL or data URI for the wallet's logo. */
  icon: string
  /** Custom URL scheme (e.g., `phantom://`) used for the deep-link probe. Optional. */
  deepLinkScheme?: string
  /**
   * HTTPS universal link (e.g., `https://phantom.app/ul/v1/connect`) used to
   * build the Phantom-style connect deep link on mobile.
   *
   * **Omit this to mark a wallet as "install/open-only"** — a wallet with no
   * external mobile connect protocol (e.g. Opindex, which only connects
   * inside its own in-app browser via Wallet Standard). On the mobile
   * deep-link path, selecting such a wallet navigates to `installUrl`
   * (then `appStoreUrl`/`playStoreUrl`) instead of attempting a connect.
   */
  universalLink?: string
  /** iOS App Store URL — used as the fallback when the deep link is not intercepted. Optional. */
  appStoreUrl?: string
  /** Google Play URL — Android fallback. Optional. */
  playStoreUrl?: string
  /**
   * Mobile download / landing page for installing or opening the wallet (e.g.
   * `https://opindex.deeptap.io`). For install/open-only wallets it is the
   * primary mobile target on the deep-link path. Takes precedence over the
   * store URLs.
   */
  installUrl?: string
  /**
   * Desktop browser-extension install page (e.g. the Chrome Web Store listing).
   * On the desktop `install-prompt` strategy — no extension detected —
   * selecting the wallet opens this in a new tab (falling back to
   * {@link installUrl} when unset).
   */
  extensionUrl?: string
  /** Optional Wallet-Standard registration name (paired by TASK-107 at discovery time). */
  standardName?: WalletName
}

const DEFAULT_PINNED_WALLET_ID = 'opindex'

/** Optional knobs for {@link getSortedWallets}. */
export interface SortOptions {
  /**
   * Which wallet should be pinned per the platform-aware rules below.
   * - `'opindex'` (default): pin Opindex on mobile / desktop-with-extension.
   * - `string`: pin that wallet id instead, using the same rules.
   * - `null`: disable pinning entirely (neutral mode for library consumers).
   */
  pinnedWalletId?: string | null
}

/**
 * Order a wallet list for display.
 *
 * 1. If `pinnedWalletId` is non-null (default `'opindex'`), the wallet whose
 *    `id` equals `pinnedWalletId` is pinned at index 0 on mobile (always), or
 *    on desktop when `platform.hasOpindexExtension` is true. The pin target
 *    may be a configured wallet OR a discovered-only entry (whose `id` is the
 *    Wallet-Standard name slug — e.g. `'Opindex'` → `'opindex'`), so a
 *    Wallet-Standard-only Opindex pins without being listed in
 *    `WalletManagerConfig.wallets`. Pass `pinnedWalletId: null` to disable
 *    pinning entirely.
 * 2. The last-used wallet from `localStorage['lastUsedWallet']` comes next
 *    (skipped if it is the same wallet already pinned, or if it is not
 *    present in the input list).
 * 3. Remaining wallets are sorted ascending by `priority`. `Array.prototype.sort`
 *    is stable per ES2019+, so equal priorities preserve input order.
 *
 * Auto-discovered wallets (entries with `source: 'discovered'` produced by
 * {@link mergeWalletList}) carry `priority: Number.MAX_SAFE_INTEGER`, so
 * they naturally sort after every configured wallet in step 3.
 *
 * Pure — never mutates the input array. SSR-safe — falls back to no
 * last-used wallet when `localStorage` is unavailable or throws.
 */
export function getSortedWallets(
  wallets: readonly WalletListEntry[],
  platform: PlatformInfo,
  options: SortOptions = {},
): WalletListEntry[] {
  const { pinnedWalletId = DEFAULT_PINNED_WALLET_ID } = options
  const remaining = [...wallets]
  const head: WalletListEntry[] = []

  const take = (predicate: (w: WalletListEntry) => boolean): void => {
    const idx = remaining.findIndex(predicate)
    if (idx === -1) return
    const [picked] = remaining.splice(idx, 1)
    if (picked) head.push(picked)
  }

  if (pinnedWalletId !== null && (platform.isMobile || platform.hasOpindexExtension)) {
    take((w) => w.id === pinnedWalletId)
  }

  const lastUsedId = getLastUsedWallet()
  if (lastUsedId !== null) {
    take((w) => w.id === lastUsedId)
  }

  remaining.sort((a, b) => a.priority - b.priority)
  return [...head, ...remaining]
}
