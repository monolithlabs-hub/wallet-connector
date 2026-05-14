#!/usr/bin/env node
/**
 * Walk every .md file under docs/ (plus the root README.md when
 * present) and run linkinator against each. Exits non-zero if any file
 * has a broken link.
 *
 * Uses linkinator's Node API rather than the CLI because the CLI
 * doesn't honor the `linksToSkip` field from a config file (only the
 * repeated `--skip` flags). The skip patterns live next to this script
 * (or, alternatively, in `linkinator.config.json` for ad-hoc CLI runs).
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { LinkChecker } from 'linkinator'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const configPath = join(repoRoot, 'linkinator.config.json')

const config = JSON.parse(await readFile(configPath, 'utf8'))
const linksToSkip = config.skip ?? config.linksToSkip ?? []
const retry = config.retry ?? false
const concurrency = config.concurrency ?? 10

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
const checker = new LinkChecker()

// Switch into repo root so relative paths (the form linkinator's markdown
// loader expects) resolve correctly.
process.chdir(repoRoot)

for (const file of targets) {
  const rel = relative(repoRoot, file)
  process.stdout.write(`\n→ Checking ${rel}\n`)

  const result = await checker.check({
    path: rel,
    markdown: true,
    linksToSkip,
    retry,
    concurrency,
  })

  let skipped = 0
  let broken = 0
  for (const link of result.links) {
    if (link.state === 'SKIPPED') {
      skipped += 1
      console.log(`  [skip] ${link.url}`)
    } else if (link.state === 'BROKEN') {
      broken += 1
      console.log(`  [${link.status ?? '?'}] ${link.url}`)
    } else {
      console.log(`  [${link.status}] ${link.url}`)
    }
  }
  console.log(`  → ${result.links.length} link(s), ${skipped} skipped, ${broken} broken`)

  if (!result.passed) failed = true
}

process.exit(failed ? 1 : 0)
