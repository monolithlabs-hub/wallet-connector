// Ambient declaration so plain `tsc` (used by tsup's DTS generator)
// can resolve `.vue` imports. `vue-tsc` would resolve them with real
// types, but tsup spawns tsc directly for `.d.ts` emission — the shim
// keeps the build green at the cost of losing prop / emit types on the
// exported component.
//
// The published types are still useful: `default` is typed as
// `DefineComponent`, which lets consumers do
// `import { ConnectButton } from '@monolithlabs/wallet-connect-vue'` and
// drop the component into a template. Granular prop / event types are
// available when the consumer's IDE / project runs `vue-tsc`.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}
