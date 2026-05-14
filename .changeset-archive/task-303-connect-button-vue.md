---
'@monolithlabs-hub/wallet-connect-vue': minor
---

TASK-303 — add `<ConnectButton>` Vue SFC to `@monolithlabs-hub/wallet-connect-vue`.

Mirrors the React `<ConnectButton>` in behavior — same modal shell, focus trap, ARIA, "Get" / "Install" badge logic, truncated-pubkey display when connected, Disconnect view — implemented as a Vue 3 single-file component using `<script setup lang="ts">`. Uses `useWallet()` internally; reads platform via `detectPlatform()` cached on first render.

**API parity with the React version**, with idiomatic Vue conventions where they differ:

- Props: `label?: string` (default `"Connect Wallet"`), `connectedLabel?: string` (default `"Connected"`).
- Emits: `connected (publicKey)`, `authenticated (publicKey, signature)` — replaces React's `onConnected` / `onAuthenticated` callback props.
- `class` / `style` forwarding: relies on Vue's attribute inheritance — `<ConnectButton class="…" style="…">` applies to the rendered `<button>` automatically. No explicit class / style props.

**Modal improvements over the React version**:

- Uses Vue's built-in `<Teleport to="body">` so the modal isn't clipped by transformed ancestor containers (React still has this caveat — `position: fixed` inside a CSS-transformed parent).
- Same accessibility floor: `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, Tab/Shift+Tab focus trap, Escape to close, focus restoration to the trigger on close.
- Auto-closes on the `authenticated` transition (not `connected`), so SIWS flows keep the dialog visible through `signing` — same fix as the React polish.

**Build tooling for SFCs** (new devDeps + config changes):

- `@vitejs/plugin-vue` for vitest's vite pipeline.
- `unplugin-vue/esbuild` for tsup's bundling pass.
- `vue-tsc` replaces plain `tsc` for typecheck AND for `.d.ts` emission (two-step build: `tsup && vue-tsc -p tsconfig.build.json`).
- `src/shims-vue.d.ts` ambient declaration so any future tooling that doesn't understand SFCs (or a consumer's plain `tsc` setup) at least resolves `.vue` imports to a generic `DefineComponent`.
- `package.json#exports` `require.types` now points to `./dist/index.d.ts` (no separate `.d.cts` — `vue-tsc` doesn't emit dual type files and types are identical across module formats).

20 tests covering all 6 PLAN.md acceptance cases plus full parity with the React test suite (custom label, Install badge, no-badge-with-extension, Shift+Tab wrap, backdrop-vs-dialog click, both lifecycle emits, auto-close + signing-state behavior, focus restoration, error rendering). Component file at 97% line coverage / 92.92% statements.
