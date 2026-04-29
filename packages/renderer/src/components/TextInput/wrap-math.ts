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

/**
 * Whether a single grapheme is a wrap-friendly whitespace — a place
 * where word-wrap is allowed to break. Plain ASCII space and tab
 * qualify; non-breaking space (U+00A0) and figure space (U+2007) do
 * NOT, by design (consumers use them to bind tokens together —
 * e.g. "Mr. Smith" with a non-breaking space between).
 *
 * Newlines aren't considered here because `wrapByWords` operates on
 * a SINGLE logical line (caller pre-splits on `\n`).
 */
function isBreakableWhitespace(grapheme: string): boolean {
  if (grapheme.length === 0) return false
  // Multi-codepoint graphemes (like ZWJ sequences) are never
  // whitespace breaks — they're meant to render as a single visual
  // unit. Fast-path: only single-codepoint graphemes can be break-
  // friendly whitespace.
  const cp = grapheme.codePointAt(0)
  if (cp === undefined) return false
  // Standard whitespace that's safe to break at.
  return cp === 0x20 || cp === 0x09
}

/**
 * Word-aware wrap: prefer to break at whitespace; fall back to the
 * char-wrap (`wrapByCells`) when a token has no breakable whitespace
 * within a row's cell budget.
 *
 * Convention at break points (matches HTML/CSS + most editors):
 *   - Trailing whitespace stays on the row it terminates. The
 *     terminal renders it as blank cells; visually invisible at the
 *     row's right edge.
 *   - Leading whitespace at the START of a logical line is treated
 *     as part of the first word — never used as a break point. A
 *     line like `'  hello'` won't be broken between the spaces and
 *     `'hello'`; it stays atomic until something past the width
 *     forces a break.
 *
 * Edge cases (covered by tests):
 *   - Single token longer than width → char-wrap fallback within that
 *     token, neighboring tokens still word-wrap.
 *   - Multiple consecutive spaces at a break → all preserved on the
 *     trailing row (collapsed visually at the boundary).
 *   - Non-breaking spaces (U+00A0) are NOT break points, so
 *     `'Mr. Smith'` stays atomic.
 *   - Empty input → `[]` (same as `wrapByCells`).
 *   - `width <= 0` → `[]`.
 */
export function wrapByWords(text: string, width: number): string[] {
  if (width <= 0) return []
  if (text.length === 0) return []

  const rows: string[] = []
  let row = ''
  let rowWidth = 0
  // Char-index within `row` where we last saw a "good" break point
  // (immediately AFTER a whitespace that came AFTER non-whitespace).
  // -1 = no break candidate. Reset on every emit.
  let lastBreakIdx = -1
  // Whether `row` contains at least one non-whitespace grapheme.
  // Without this, leading whitespace would set up a break candidate
  // BETWEEN the leading whitespace and the first word — splitting
  // `'  hello'` into `['  ', 'hello']`. Tracking this prevents that.
  let hasContent = false

  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const w = stringWidth(segment)
    const breakable = isBreakableWhitespace(segment)

    if (breakable) {
      // Whitespace always fits — even past width, since it's
      // visually invisible at the boundary. Append to current row;
      // record a candidate break IF we already have non-ws content
      // (so leading whitespace isn't a break point).
      row += segment
      rowWidth += w
      if (hasContent) lastBreakIdx = row.length
      continue
    }

    // Non-whitespace grapheme.
    if (rowWidth + w > width) {
      if (lastBreakIdx > 0) {
        // Break at the last whitespace boundary. The overhang
        // (anything between lastBreakIdx and end of row) carries to
        // the next row before the current grapheme — usually empty
        // because we haven't appended the current grapheme yet.
        rows.push(row.slice(0, lastBreakIdx))
        const overhang = row.slice(lastBreakIdx)
        row = overhang + segment
        rowWidth = stringWidth(row)
      } else {
        // No whitespace break in current row. Fall back to char-wrap
        // behavior: push what we have, start fresh with the current
        // grapheme. If the grapheme itself is wider than width, it
        // overflows on its own row — same as wrapByCells.
        if (row.length > 0) rows.push(row)
        row = segment
        rowWidth = w
      }
      lastBreakIdx = -1
      hasContent = true
      continue
    }

    // Fits in the current row.
    row += segment
    rowWidth += w
    hasContent = true
  }

  if (row.length > 0) rows.push(row)
  return rows
}
