#!/usr/bin/env node
/**
 * Verify that every TypeScript / TSX fenced code block in README.md parses
 * cleanly. Implements PLAN.md TASK-604's "Verify all code examples are
 * syntactically valid TypeScript" requirement.
 *
 * Pragmatic interpretation:
 *  - Run `ts.transpileModule` with `noResolve: true` so module resolution
 *    is skipped — snippets can `import` from packages we don't install
 *    inside this check.
 *  - Surface syntax-category diagnostics and emit diagnostics.
 *  - Skip non-`ts` / non-`tsx` fenced blocks (`bash`, `vue`, etc.).
 *
 * Run with `pnpm readme:check`.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const readmePath = join(repoRoot, 'README.md')

const md = readFileSync(readmePath, 'utf8')

// Match fenced blocks. The trailing `\n` before the closing fence is part
// of the snippet body; the opening fence eats one trailing newline.
const fenceRe = /```([a-zA-Z0-9]+)\n([\s\S]*?)```/g

const supported = new Set(['ts', 'tsx'])
const snippets = []
for (const match of md.matchAll(fenceRe)) {
  const lang = match[1]
  const code = match[2]
  if (!supported.has(lang)) continue
  // Each match's `index` is byte offset; compute the 1-based line where
  // the fence opens so error reporting points back to README.md.
  const before = md.slice(0, match.index)
  const lineNumber = before.split('\n').length + 1 // +1 for the language fence line itself
  snippets.push({ lang, code, lineNumber })
}

if (snippets.length === 0) {
  console.error('No ts/tsx snippets found in README.md. This is unexpected — failing.')
  process.exit(1)
}

const compilerOptions = {
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  jsx: ts.JsxEmit.ReactJSX,
  strict: true,
  noResolve: true,
  isolatedModules: true,
  esModuleInterop: true,
  skipLibCheck: true,
}

let failed = false

for (const [i, { lang, code, lineNumber }] of snippets.entries()) {
  const fileName = `snippet-${i + 1}.${lang}`
  const result = ts.transpileModule(code, {
    compilerOptions,
    reportDiagnostics: true,
    fileName,
  })

  const errors = (result.diagnostics ?? []).filter(
    (d) => d.category === ts.DiagnosticCategory.Error,
  )

  if (errors.length === 0) {
    console.log(`✓ snippet #${i + 1} (${lang}, README.md:${lineNumber}) — parses cleanly`)
    continue
  }

  failed = true
  console.error(
    `\n✗ snippet #${i + 1} (${lang}, README.md:${lineNumber}) — ${errors.length} error(s):`,
  )
  for (const d of errors) {
    const msg = ts.flattenDiagnosticMessageText(d.messageText, '\n  ')
    if (d.file && d.start !== undefined) {
      const { line, character } = d.file.getLineAndCharacterOfPosition(d.start)
      console.error(`  TS${d.code} at snippet line ${line + 1}:${character + 1} — ${msg}`)
    } else {
      console.error(`  TS${d.code} — ${msg}`)
    }
  }
}

process.exit(failed ? 1 : 0)
