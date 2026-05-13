import { defineConfig } from 'tsup'
import Vue from 'unplugin-vue/esbuild'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // `.d.ts` emission is handled by `vue-tsc` (see `build:types` in
  // package.json). tsup's built-in DTS uses Rollup, which doesn't
  // understand `.vue` imports and fails. Two-step build (`tsup &&
  // vue-tsc --emitDeclarationOnly`) cleanly separates JS bundling from
  // type emission.
  dts: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  outExtension({ format }) {
    return { js: format === 'esm' ? '.mjs' : '.cjs' }
  },
  tsconfig: 'tsconfig.build.json',
  // `unplugin-vue/esbuild` handles `.vue` SFC parsing for both the ESM
  // and CJS passes. Templates compile to `h()` calls; script blocks
  // run through esbuild's TS pipeline.
  esbuildPlugins: [Vue()],
})
