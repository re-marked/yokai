/**
 * Wrap math primitive for `<TextInput>`'s soft-wrap multiline mode.
 *
 * This file evolves across the soft-wrap PR — each commit adds one
 * layer:
 *
 *   A1. wrapByCells   — char-wrap fallback (this commit)
 *   A2. wrapByWords   — word-aware wrap with whitespace breaks
 *   A3. buildWrapLayout — logical/visual position maps over multi-line input
 *   A4. nextVisualRow — preferred-column tracker for visual up/down
 *   A5. identifier-aware boundary classifier
 *   A6. wrap hints (programmatic break control)
 *   B1. hanging-indent support
 *
 * Pure helpers only — no React, no DOM, no I/O. Everything is
 * unit-testable in isolation against `wrap-math.test.ts`.
 */

import { getGraphemeSegmenter } from '@yokai/shared'
import { stringWidth } from '../../stringWidth.js'

/**
 * Hard-break a single logical line into visual rows of at most
 * `width` cells each. Treats every grapheme as one indivisible unit
 * — combining marks attach to their base, surrogate-pair emoji stay
 * intact, ZWJ-joined sequences (👨‍👩‍👧) are one grapheme.
 *
 * This is the FALLBACK wrap mode used when:
 *   - the consumer asks for `wrap: 'char'` explicitly (future prop), OR
 *   - the higher-level word-wrap (`wrapByWords`) can't find a
 *     whitespace break point within a row's worth of cells, OR
 *   - the input is a single token longer than `width` cells.
 *
 * Caller's contract:
 *   - `text` is a SINGLE logical line — no `\n`. Multi-line input is
 *     handled by `buildWrapLayout` (A3) which splits on `\n` first and
 *     wraps each segment.
 *   - `width` is the available cell budget per row, already net of
 *     border + padding. The caller (TextInput's renderer) does the
 *     yoga inner-size measurement.
 *
 * Edge cases (covered by tests):
 *   - Empty input → `[]` (no rows). Distinct from `[''']` (one empty row).
 *   - `width <= 0` → `[]`. Degenerate; emit nothing rather than infinite-loop.
 *   - A single grapheme wider than `width` → emitted on its own row,
 *     accepting the overflow. Preserves data; the alternative (drop or
 *     replace) is worse than a brief render glitch on pathological input.
 *   - Zero-width graphemes (combining marks, ZWJ) at the start of a row
 *     attach to the previous row's last grapheme if there is one;
 *     otherwise they become a leading orphan on a new row. The TextInput
 *     normalizes input through React's controlled value before this is
 *     called, so leading orphans are vanishingly rare in practice.
 */
export function wrapByCells(text: string, width: number): string[] {
  if (width <= 0) return []
  if (text.length === 0) return []

  const rows: string[] = []
  let currentRow = ''
  let currentWidth = 0

  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const w = stringWidth(segment)

    // Zero-width grapheme — attach to current row without advancing
    // the cell counter. Combining marks (̃ ̀ ́), ZWJ (‍), variation
    // selectors (︎️) all land here. If currentRow is empty
    // they become a leading orphan; the caller is expected to feed
    // input that doesn't start with one (TextInput normalizes via
    // React's controlled value).
    if (w === 0) {
      currentRow += segment
      continue
    }

    // Single grapheme wider than the entire row width. Can't fit it
    // anywhere clean — emit it on its own overflowing row, preserving
    // the data. The renderer will visibly overflow but the user can
    // still see + edit the character.
    if (w > width) {
      if (currentRow.length > 0) {
        rows.push(currentRow)
      }
      rows.push(segment)
      currentRow = ''
      currentWidth = 0
      continue
    }

    // Adding this grapheme would overflow → start a new row.
    if (currentWidth + w > width) {
      rows.push(currentRow)
      currentRow = segment
      currentWidth = w
      continue
    }

    // Fits in the current row.
    currentRow += segment
    currentWidth += w
  }

  if (currentRow.length > 0) {
    rows.push(currentRow)
  }
  return rows
}
