# Opindex pinning — what, why, and how to disable

This library is built by Monolith Labs, the team behind [Opindex](https://opindex.app). The default configuration pins Opindex to the top of the wallet list on platforms where Opindex is installable. This page exists so you can decide what to do about that with full information.

If you're a consumer building a neutral dapp and want the answer up front:

```ts
const config: WalletManagerConfig = {
  wallets: [PHANTOM, SOLFLARE /* … */],
  pinnedWallet: null, // disable Opindex pinning entirely
}
```

That's it. The rest of this page explains what the pin does, why it's there, and the second-order effects of disabling it.

## What pinning actually does

The default `pinnedWallet: 'opindex'` triggers two platform-aware behaviors:

1. **Sort order.** Opindex moves to index 0 of the wallet list on:
   - Mobile (always — iOS can't probe for an installed Opindex app, so we show it unconditionally and the deep link falls back to the App Store after 1500 ms if the app isn't installed).
   - Desktop **with the Opindex extension detected** (via Wallet Standard registration or the legacy `window.opindex.isOpindex` sentinel).

   On desktop **without** the Opindex extension, Opindex is NOT pinned — it sorts by `priority` like everything else. That's how the example app shows Opindex at the bottom when you don't have it installed.

2. **Install badge.** When the pinned wallet is detectable, the modal renders the "Detected" badge on its row. When it isn't detectable on a platform where it would be relevant (mobile, or desktop without the extension), the modal renders the "Get" (iOS) or "Install" (everywhere else) badge that links to the App Store / Play Store / extension store.

The pin only changes display ordering — it doesn't change the wallet you connect to. Users always pick from the modal.

## Why it's pinned by default

Honest answer: Opindex is our wallet. We built this library partly because we wanted a clean integration story for it, and pinning it by default is the simplest distribution mechanism. If you're using this library in a Monolith Labs property, the pin is "on brand". If you're building a neutral or competitor dapp, you probably want it off — and we make that one knob.

We chose to make this transparent rather than hidden because:

- The pin only changes display order, not the connection behavior — your users still pick whatever wallet they actually have.
- The disable knob is a single config option, not buried in source.
- Auto-discovery of Wallet Standard wallets means your users see every wallet they've installed regardless of what you configure.

## The disable knob

```ts
import type { WalletManagerConfig } from '@monolithlabs/wallet-connect-core'

const config: WalletManagerConfig = {
  wallets: [PHANTOM, SOLFLARE, BACKPACK],
  pinnedWallet: null, // <-- disables the Opindex pin
}
```

`pinnedWallet: null` turns the pin off across all platforms. The wallet list sorts purely by:

1. Last-used wallet (from `localStorage['lastUsedWallet']`) at index 0 if present.
2. Remaining wallets sorted ascending by `WalletConfig.priority`.

You can also pin a different wallet by passing its id:

```ts
pinnedWallet: 'phantom'
```

That swaps Opindex for Phantom, applying the same platform-aware rules. Whoever's wallet you point at gets the pin treatment.

## What disabling does NOT do

Disabling the pin does not:

- Remove Opindex from the wallet list (it stays at its `priority` position).
- Change any other library behavior — connect flows, SIWS, mobile redirect handling all work identically.
- Affect Wallet Standard auto-discovery — users with any wallet installed still see it.

If you want to remove Opindex from the modal entirely, just leave it out of `config.wallets`. The merge between configured + auto-discovered wallets only adds wallets the user has actually installed via the Wallet Standard registry; Opindex isn't a Wallet Standard wallet (yet), so it won't auto-appear.

```ts
const config: WalletManagerConfig = {
  wallets: [PHANTOM, SOLFLARE], // no OPINDEX entry → no Opindex in the modal
  pinnedWallet: null,
}
```

## Side effects to know about

A few subtle interactions with other library behaviors:

- **Last-used wallet still wins index 0.** If a user previously connected to Opindex, `localStorage['lastUsedWallet'] === 'opindex'` and Opindex sorts first on their next visit regardless of `pinnedWallet`. This is the same elevate-last-used logic that applies to every wallet — clearing the storage key resets it.
- **The legacy `window.opindex.isOpindex` sentinel still flips `isDetected: true`.** This is a backward-compat path for an older Opindex sentinel and isn't the canonical detection mechanism — real Opindex registers via Wallet Standard. The "Detected" badge can fire even when `pinnedWallet: null` is set, because `isDetected` is a property of the wallet entry, not the pin status.
- **The `<ConnectButton>`'s pinned-wallet treatment uses a hardcoded `'opindex'` id internally.** This means the "Install" badge in the React/Vue components fires specifically on the wallet with `id === 'opindex'`, not on whatever wallet you pin via `pinnedWallet`. The sort order respects `pinnedWallet`; the badge currently does not. If this matters for your dapp, file an issue or open a PR — the fix is small.

## A note on transparency

If you build a wallet aggregator or a competing dapp, you may understandably feel weird about a library that pins its author's wallet by default. The honest tradeoffs we made when designing this:

- Defaulting to no pin (`null`) would mean every Monolith Labs property has to remember to opt back in. Easy to forget; cosmetic but annoying.
- Hiding the pin behind an undocumented option would be worse than this page.
- Splitting into two packages (`@monolithlabs/wallet-connect-react` and `@monolithlabs/opindex-pin`) is an option for a future major if community pressure makes the bundled pin untenable.

For now: the default is a pin, the disable is one line, and this page is in the public docs.
