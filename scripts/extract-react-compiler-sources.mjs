#!/usr/bin/env node
/**
 * One-time recovery tool: restore authored source from inline sourcemaps.
 *
 * Background: at some point, React Compiler output was generated and
 * committed in place of the authored .tsx sources in packages/renderer/src.
 * Each compiled file had its original source preserved as a base64-encoded
 * inline sourcemap (`sourceMappingURL=data:application/json;...`) at the
 * end of the file. This script walks every .tsx that imports from
 * `react/compiler-runtime`, decodes the sourcemap's `sourcesContent[0]`,
 * and writes it back over the file.
 *
 * Idempotent: a file with no `react/compiler-runtime` import (i.e. already
 * authored source) is skipped silently. Re-running has no effect once
 * recovery is complete.
 *
 * Safety: refuses to overwrite if the sourcemap is missing, empty, or
 * fails to parse. Logs every action.
 *
 * Usage: node scripts/extract-react-compiler-sources.mjs [target-dir]
 *   target-dir defaults to packages/renderer/src
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const COMPILER_IMPORT = 'react/compiler-runtime'
const SM_RE = /\/\/# sourceMappingURL=data:application\/json;charset=utf-8;base64,([A-Za-z0-9+/=]+)\s*$/m

function walk(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

function restore(file) {
  const content = readFileSync(file, 'utf8')
  if (!content.includes(COMPILER_IMPORT)) return { file, status: 'skip-not-compiled' }

  const m = content.match(SM_RE)
  if (!m) return { file, status: 'error-no-sourcemap' }

  let sm
  try {
    sm = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8'))
  } catch (e) {
    return { file, status: 'error-corrupt-sourcemap', detail: e.message }
  }

  if (!sm.sourcesContent || !sm.sourcesContent[0]) {
    return { file, status: 'error-empty-sourcemap' }
  }

  const original = sm.sourcesContent[0]
  // Trailing newline normalization: the embedded source may or may not end
  // with one. Force exactly one final newline for POSIX-correctness.
  const normalized = original.endsWith('\n') ? original : original + '\n'
  writeFileSync(file, normalized, 'utf8')
  return { file, status: 'restored', bytes: normalized.length }
}

const targetDir = process.argv[2] ?? 'packages/renderer/src'
const files = walk(targetDir)

let restored = 0
let skipped = 0
let errors = 0
for (const f of files) {
  const r = restore(f)
  if (r.status === 'restored') {
    restored++
    console.log(`restored: ${r.file} (${r.bytes} bytes)`)
  } else if (r.status === 'skip-not-compiled') {
    skipped++
  } else {
    errors++
    console.error(`ERROR ${r.status}: ${r.file}${r.detail ? ' — ' + r.detail : ''}`)
  }
}

console.log(`\n${restored} restored, ${skipped} skipped (already source), ${errors} errors`)
process.exit(errors > 0 ? 1 : 0)
