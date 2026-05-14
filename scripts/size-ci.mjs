#!/usr/bin/env node
// Run size-limit and emit JSON to stdout.
//
// Why this wrapper exists: the canonical invocation `pnpm exec size-limit --json`
// fails on CI under pnpm 11 (treated as recursive across workspace packages,
// throwing ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL). `npx size-limit --json` auto-
// downloads a plugin-less copy when it can't see the local bin. Node's own
// module resolution walks node_modules cleanly regardless of how pnpm hoisted
// things, so we resolve size-limit's bin file by package name and invoke it
// directly with stdio passed through.

import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

// Resolve from the working directory rather than from this file's location,
// so the wrapper works when staged outside the repo tree (e.g. in $RUNNER_TEMP
// during CI, where this file lives next to the action's two-branch checkout).
const require = createRequire(`${process.cwd()}/`)

let pkgJsonPath
try {
  pkgJsonPath = require.resolve('size-limit/package.json')
} catch (err) {
  if (err && (err.code === 'MODULE_NOT_FOUND' || err.code === 'ERR_MODULE_NOT_FOUND')) {
    // size-limit isn't installed in this checkout — typically the baseline
    // (main) branch on the PR that first introduces bundle-size monitoring.
    // Emit an empty result set so the size-limit GitHub action can still
    // parse JSON and treat every measurement on the PR side as "added".
    process.stdout.write('[]\n')
    process.exit(0)
  }
  throw err
}

const pkg = require('size-limit/package.json')
const binPath = join(dirname(pkgJsonPath), pkg.bin)

const result = spawnSync(process.execPath, [binPath, '--json'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
