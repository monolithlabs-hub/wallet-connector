---
'@monolithlabs-hub/wallet-connect-vue': minor
'@monolithlabs-hub/wallet-connect-react': minor
'@monolithlabs-hub/wallet-connect-ui': minor
---

Expose `WalletConnectInjectionKey` from the public Vue exports.

The symbol was previously internal but already documented as "exported for tests that wire a stub manager via `provide` directly". Promoting it from "for tests" to public API enables consumer-side patterns like a per-subtree `<DemoProvider>` component that scopes the manager via `provide(WalletConnectInjectionKey, manager)` instead of `app.use(WalletConnectPlugin)` at the app level. The Vue example app (`examples/vue-example/`) uses this pattern to isolate four demo configurations behind a single hash router.

No behavior change — `WalletConnectPlugin`, `useWallet`, and `useWalletContext` all keep their existing semantics. The bumps for `@monolithlabs-hub/wallet-connect-react` and `@monolithlabs-hub/wallet-connect-ui` are induced by the `linked` group rule in `.changeset/config.json`.
