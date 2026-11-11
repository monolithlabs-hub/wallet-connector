---
'@monolithlabs-hub/wallet-connect-core': minor
'@monolithlabs-hub/wallet-connect-react': patch
'@monolithlabs-hub/wallet-connect-vue': patch
---

Track wallet-side account switches and disconnects on the extension path.

Previously the `WalletManager` ignored the adapter's lifecycle events: after the
user switched accounts in the extension, `getContext().publicKey` (and
`useWallet().publicKey`) kept reporting the old account while the adapter signed
with the new one — transactions built for account A were sent to a wallet on
account B and rejected.

- core: the manager subscribes to the active adapter while a session is live. An
  account switch is treated as a new connection (publicKey updated, old SIWS
  signature dropped, `onConnected` re-fires, `requireSignIn` flows land in
  `'connected'`); a wallet-side disconnect resets to `'idle'`. New config
  callbacks `onAccountChanged(publicKey, previousPublicKey)` and
  `onWalletDisconnected()`. Subscriptions are released on `disconnect()`,
  re-`connect()` and `destroy()`.
- core: signing methods throw `WalletAccountError` if the wallet's current
  account differs from the session's publicKey.
- core: `StandardWalletAdapter.signIn` emits `'accountsChange'` when the wallet
  answers with a different account than the connected one.
- react / vue: `<ConnectButton>` fires `onConnected` / emits `connected` again
  on an account switch (the state alone can read `authenticated → authenticated`).
