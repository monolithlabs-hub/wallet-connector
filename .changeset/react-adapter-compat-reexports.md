---
'@monolithlabs-hub/wallet-connect-react': minor
---

Re-export the wallet-adapter-base replacement surface from the react package: the
full `WalletError` taxonomy, `asWalletName`, and the `WalletName` type (all sourced
from core). Consumers migrating off `@solana/wallet-adapter-{react,base}` can now
import errors and wallet-name helpers from `@monolithlabs-hub/wallet-connect-react`
alongside `useWallet`, instead of reaching into core. The package stays
`@solana/web3.js`-free — the object/`PublicKey` conversion shim lives in the
consuming app, wrapping the existing byte-based `useWallet()`.
