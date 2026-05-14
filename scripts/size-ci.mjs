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

const require = createRequire(import.meta.url)
const pkgJsonPath = require.resolve('size-limit/package.json')
const pkg = require('size-limit/package.json')
const binPath = join(dirname(pkgJsonPath), pkg.bin)

const result = spawnSync(process.execPath, [binPath, '--json'], { stdio: 'inherit' })
process.exit(result.status ?? 1)
