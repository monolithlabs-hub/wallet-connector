# Third-party licenses

This project contains code ported from third-party open-source projects.
Each ported file carries an attribution header comment. The table below
lists every such file, its upstream origin, and the license under which it
was ported.

## Apache License, Version 2.0

Source project: [`anza-xyz/wallet-adapter`](https://github.com/anza-xyz/wallet-adapter)
License: Apache-2.0
Upstream license file: <https://github.com/anza-xyz/wallet-adapter/blob/master/LICENSE>

| File in this repo                  | Ported from (upstream path)                                       |
| ---------------------------------- | ----------------------------------------------------------------- |
| `packages/core/src/errors.ts`      | `packages/core/base/src/errors.ts`                                |
| `packages/core/src/ready-state.ts` | `packages/core/base/src/adapter.ts` (the `WalletReadyState` enum) |
| `packages/core/src/wallet-name.ts` | `packages/core/base/src/types.ts` (the `WalletName` branded type) |

When TASK-107 lands, this table will gain an entry for
`packages/core/src/adapters/standard-wallet-adapter.ts` (ported from
`packages/wallet-standard/wallet-adapter-base/src/wallet.ts`) and for
`packages/core/src/discovery.ts` (the `isWalletAdapterCompatibleStandardWallet`
helper, ported from the same upstream package).

The full text of the Apache License, Version 2.0 is available at
<http://www.apache.org/licenses/LICENSE-2.0>.

## Adding a new ported file

When porting any additional code:

1. Add a file-level header comment identifying the upstream file and license.
2. Add a row to the table above.
3. Update `NOTICE` if a new upstream project is being credited.
