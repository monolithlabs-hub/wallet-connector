#!/usr/bin/env node
/**
 * Walk every .md file under docs/ (plus the root README.md when present)
 * and run linkinator against each. Exits non-zero if any file has a
 * broken link.
 *
 * Why a Node wrapper around the linkinator CLI?
 *  - linkinator can scan one location at a time. The wrapper handles the
 *    per-file iteration in a portable way (no shell-specific globbing).
 *  - Aggregating the exit code lets us walk every file even when an
 *    earlier file has broken links — the user sees them all in one run
 *    instead of finding-and-fixing one at a time.
 *
 * linkinator config (ignored URL patterns, retry behavior) lives at
 * `linkinator.config.json` at the repo root.
 */

import { execSync } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = join(repoRoot, 'linkinator.config.json')

function collectMarkdown(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const s = statSync(full)
    if (s.isDirectory()) {
      out.push(...collectMarkdown(full))
    } else if (entry.endsWith('.md')) {
      out.push(full)
    }
  }
  return out
}

const targets = [...collectMarkdown(join(repoRoot, 'docs'))]
const readme = join(repoRoot, 'README.md')
if (existsSync(readme)) targets.push(readme)

if (targets.length === 0) {
  console.error('No markdown files found.')
  process.exit(0)
}

let failed = false
for (const file of targets) {
  const rel = relative(repoRoot, file)
  process.stdout.write(`\n→ Checking ${rel}\n`)
  try {
    execSync(
      `pnpm exec linkinator --markdown --config ${JSON.stringify(configPath)} ${JSON.stringify(file)}`,
      { stdio: 'inherit', cwd: repoRoot },
    )
  } catch {
    failed = true
  }
}

process.exit(failed ? 1 : 0)
