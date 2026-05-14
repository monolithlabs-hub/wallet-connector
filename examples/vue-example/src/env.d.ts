/// <reference types="vite/client" />

// Vite's Vue plugin types .vue imports for us, but ship a fallback shim
// for any consumer tooling that doesn't pick the plugin up automatically.
declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>
  export default component
}
