import type { PlatformInfo } from '../platform/detector'
import { getLastUsedWallet } from '../session/store'
import type { WalletName } from '../wallet-name'

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
  /** Custom URL scheme (e.g., `phantom://`) used for the deep-link probe. */
  deepLinkScheme: string
  /** HTTPS universal link (e.g., `https://phantom.app/ul/v1/connect`). */
  universalLink: string
  /** iOS App Store URL — used as the fallback when the deep link is not intercepted. */
  appStoreUrl: string
  /** Google Play URL — Android fallback. */
  playStoreUrl: string
  /** Optional Wallet-Standard registration name (paired by TASK-107 at discovery time). */
  standardName?: WalletName
}

const OPINDEX_ID = 'opindex'

/**
 * Order a wallet list for display.
 *
 * 1. Opindex is pinned at index 0 on mobile (always), or on desktop when
 *    `platform.hasOpindexExtension` is true.
 * 2. The last-used wallet from `localStorage['lastUsedWallet']` comes next
 *    (skipped if it is the same wallet already pinned, or if it is not
 *    present in the input list).
 * 3. Remaining wallets are sorted ascending by `priority`. `Array.prototype.sort`
 *    is stable per ES2019+, so equal priorities preserve input order.
 *
 * Pure — never mutates the input array. SSR-safe — falls back to no
 * last-used wallet when `localStorage` is unavailable or throws.
 */
export function getSortedWallets(
  wallets: readonly WalletConfig[],
  platform: PlatformInfo,
): WalletConfig[] {
  const remaining = [...wallets]
  const head: WalletConfig[] = []

  const take = (predicate: (w: WalletConfig) => boolean): void => {
    const idx = remaining.findIndex(predicate)
    if (idx === -1) return
    const [picked] = remaining.splice(idx, 1)
    if (picked) head.push(picked)
  }

  const pinOpindex = platform.isMobile || platform.hasOpindexExtension
  if (pinOpindex) {
    take((w) => w.id === OPINDEX_ID)
  }

  const lastUsedId = getLastUsedWallet()
  if (lastUsedId !== null) {
    take((w) => w.id === lastUsedId)
  }

  remaining.sort((a, b) => a.priority - b.priority)
  return [...head, ...remaining]
}
