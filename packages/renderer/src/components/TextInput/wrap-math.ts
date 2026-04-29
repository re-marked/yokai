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
 * Word-boundary detection mode for `wrapByWords` and `buildWrapLayout`.
 *
 * - `'whitespace'` (default): break only at standard whitespace
 *   (space, tab). No identifier-awareness, no URL detection. The
 *   simplest, fastest mode — ~all consumer text inputs are fine
 *   with this.
 * - `'identifier'`: ALSO break at `_` / `-` boundaries (snake_case,
 *   kebab-case) and at lowercase→uppercase transitions (camelCase,
 *   PascalCase). Treats URLs (`http(s)://...`) as atomic — never
 *   breaks inside them. Tuned for code-like + CLI command content
 *   (slash commands with flags, identifiers, file paths).
 */
export type WordBoundaryMode = 'whitespace' | 'identifier'

// URL detection regex — scans a logical line for spans that should
// be treated as atomic (never broken inside). `\S+` captures up to
// the next whitespace; conservative but matches what users mean by
// "a URL." Hash fragments and query strings are included via \S+.
//
// Not exported — only the identifier-aware classifier uses it.
const URL_REGEX = /https?:\/\/\S+/g

function findUrlRanges(line: string): Array<readonly [number, number]> {
  const ranges: Array<readonly [number, number]> = []
  URL_REGEX.lastIndex = 0
  for (const match of line.matchAll(URL_REGEX)) {
    const start = match.index
    if (start === undefined) continue
    ranges.push([start, start + match[0].length] as const)
  }
  return ranges
}

function isInsideRange(ranges: ReadonlyArray<readonly [number, number]>, charIdx: number): boolean {
  // Linear scan — URL ranges per line are typically 0-2, fast enough.
  for (const [start, end] of ranges) {
    if (charIdx > start && charIdx < end) return true
  }
  return false
}

/**
 * In identifier-aware mode, classify a candidate break position
 * (BETWEEN two graphemes) as one of:
 *   - 'break' — whitespace; always preferred
 *   - 'preferred' — after `_` / `-` or at a camelCase / PascalCase
 *     transition; second-tier break candidate
 *   - 'avoid' — inside a URL atomic span; never used as a break
 *   - null — neutral position; not a candidate
 *
 * `prevChar` is the character immediately before the position;
 * `nextChar` is the character immediately after. Both are single
 * code-units (not graphemes — sufficient for ASCII identifier
 * detection). Either may be undefined at line edges.
 */
function classifyIdentifierBoundary(
  prevChar: string | undefined,
  nextChar: string | undefined,
  posInLine: number,
  urlRanges: ReadonlyArray<readonly [number, number]>,
): 'break' | 'preferred' | 'avoid' | null {
  // URL atomicity overrides everything — even whitespace inside a URL
  // would be unbreakable, but URLs typically don't contain whitespace.
  if (isInsideRange(urlRanges, posInLine)) return 'avoid'

  // Whitespace at the next position → standard break candidate.
  // The position is BETWEEN prevChar and nextChar; if nextChar is
  // whitespace, the wrap loop's existing "isBreakableWhitespace"
  // path already records it. We classify as 'break' so the
  // higher-level merger doesn't need a separate code path.
  if (nextChar !== undefined && isBreakableWhitespace(nextChar)) return 'break'

  // After _ / - (snake_case, kebab-case): position right after the
  // separator is a preferred break point. Land the next word on the
  // following row.
  if (prevChar === '_' || prevChar === '-') return 'preferred'

  // camelCase / PascalCase transition: lowercase → uppercase. Break
  // BEFORE the uppercase letter.
  if (
    prevChar !== undefined &&
    nextChar !== undefined &&
    isLowercaseAscii(prevChar) &&
    isUppercaseAscii(nextChar)
  ) {
    return 'preferred'
  }

  return null
}

function isLowercaseAscii(ch: string): boolean {
  if (ch.length === 0) return false
  const cp = ch.codePointAt(0) ?? 0
  return cp >= 0x61 && cp <= 0x7a
}

function isUppercaseAscii(ch: string): boolean {
  if (ch.length === 0) return false
  const cp = ch.codePointAt(0) ?? 0
  return cp >= 0x41 && cp <= 0x5a
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
export function wrapByWords(
  text: string,
  width: number,
  boundaries: WordBoundaryMode = 'whitespace',
): string[] {
  if (width <= 0) return []
  if (text.length === 0) return []

  // Identifier mode: precompute URL atomic spans up front. Cheaper
  // than a regex.test per grapheme, and most lines have zero URLs.
  const urlRanges = boundaries === 'identifier' ? findUrlRanges(text) : []

  const rows: string[] = []
  let row = ''
  let rowWidth = 0
  // Best-known break point in the current row, prioritizing 'break'
  // over 'preferred' (and over no candidate). When the row needs to
  // break, this is where we cut.
  let lastBreakIdx = -1
  // Quality of the lastBreakIdx — true if it's a 'break' (whitespace),
  // false if 'preferred' (identifier transition). A later 'break' wins
  // over an earlier 'preferred'; a later 'preferred' does NOT replace
  // an existing 'break' (because breaks are higher priority).
  let lastBreakIsHard = false
  // Whether `row` contains at least one non-whitespace grapheme.
  // Without this, leading whitespace would set up a break candidate
  // BETWEEN the leading whitespace and the first word — splitting
  // `'  hello'` into `['  ', 'hello']`. Tracking this prevents that.
  let hasContent = false
  // Track the previous char (single code unit) for boundary detection
  // — identifier mode needs to look at the prev char to decide if the
  // current position is a snake/kebab/camel transition.
  let prevChar: string | undefined

  // Position in the input string where the current row started — used
  // to map row-relative break positions to URL-range checks (which
  // are absolute in `text`).
  let rowAbsStart = 0

  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const w = stringWidth(segment)
    const breakable = isBreakableWhitespace(segment)
    const absPosBefore = rowAbsStart + row.length

    if (breakable) {
      // Whitespace always fits past width (invisible at boundary).
      row += segment
      rowWidth += w
      if (hasContent) {
        // Whitespace gives us a HARD break candidate — overrides any
        // earlier soft 'preferred' candidate.
        lastBreakIdx = row.length
        lastBreakIsHard = true
      }
      prevChar = segment[0]
      continue
    }

    // Identifier-mode soft break check: is the position BEFORE the
    // current grapheme a preferred break? If so, record it (but only
    // if no harder break is already known later in the row).
    if (boundaries === 'identifier' && hasContent && prevChar !== undefined) {
      const kind = classifyIdentifierBoundary(prevChar, segment[0], absPosBefore, urlRanges)
      // 'break' is handled by the whitespace branch above; here we
      // only care about 'preferred'. 'avoid' explicitly suppresses
      // any candidate — but since we only RECORD candidates here
      // (not overwrite), we just skip without resetting.
      if (kind === 'preferred' && !lastBreakIsHard) {
        lastBreakIdx = row.length
      }
    }

    // Non-whitespace grapheme.
    if (rowWidth + w > width) {
      if (lastBreakIdx > 0) {
        rows.push(row.slice(0, lastBreakIdx))
        const overhang = row.slice(lastBreakIdx)
        rowAbsStart += lastBreakIdx
        row = overhang + segment
        rowWidth = stringWidth(row)
      } else {
        // No break candidate — char-wrap fallback.
        if (row.length > 0) {
          rows.push(row)
          rowAbsStart += row.length
        }
        row = segment
        rowWidth = w
      }
      lastBreakIdx = -1
      lastBreakIsHard = false
      hasContent = true
      prevChar = segment[segment.length - 1]
      continue
    }

    row += segment
    rowWidth += w
    hasContent = true
    prevChar = segment[segment.length - 1]
  }

  if (row.length > 0) rows.push(row)
  return rows
}

/**
 * Per-row metadata produced by `buildWrapLayout`. Each visual row
 * carries enough context for the renderer to:
 *
 *   - Render the row's text
 *   - Render selection highlights (needs startCharIdx + endCharIdx
 *     to slice the buffer-relative selection range to row-local)
 *   - Show wrap-continuation indicators (B-phase: the gutter glyph
 *     at the start of `isWrapContinuation` rows)
 *   - Map clicks back to buffer positions (visualToLogical)
 */
export type VisualRow = {
  /** Text rendered on this row (no `\n` — that's a separator, never inside row text). */
  readonly text: string
  /** Index of the source logical line this row came from (0-based). */
  readonly logicalLine: number
  /** Char index in the full buffer where this row's text starts. */
  readonly startCharIdx: number
  /** Char index in the full buffer where this row's text ends (exclusive). */
  readonly endCharIdx: number
  /** True iff this row is a wrap continuation of the previous row's
   *  logical line (vs starting a new logical line via `\n`). The
   *  renderer uses this to draw a wrap-indicator glyph in the gutter. */
  readonly isWrapContinuation: boolean
}

/** Output of `buildWrapLayout`. The `rows` array is the rendering
 *  source-of-truth; the two map functions handle caret positioning. */
export type WrapLayout = {
  readonly rows: ReadonlyArray<VisualRow>
  /** Translate a buffer char index to (visualRow, visualCol). The
   *  column is in CELLS (wide chars count as 2). At a wrap boundary
   *  (charIdx is the start of a continuation row), returns the
   *  START of the new row, not the end of the previous — visually
   *  clearer to the user where the caret is. */
  readonly logicalToVisual: (charIdx: number) => { row: number; col: number }
  /** Translate a visual (row, col) cell coordinate back to a buffer
   *  char index. Used by click-to-position. Clamps `col` to the
   *  row's content if the click landed past the row's last char. */
  readonly visualToLogical: (row: number, col: number) => number
}

export type WrapOptions = {
  /** Cell budget per row (already net of border + padding). */
  width: number
  /** Wrap strategy. Default `'word'`. `'char'` skips word-boundary
   *  detection entirely — useful when the consumer wants packed
   *  density (e.g. a hex dump or a no-prose token list). */
  wrap?: 'word' | 'char'
  /** Word boundary detection mode. Only used when `wrap === 'word'`.
   *  Default `'whitespace'`. See `WordBoundaryMode` for details. */
  wordBoundaries?: WordBoundaryMode
}

/**
 * Build a complete wrap layout for a multi-line buffer.
 *
 * Splits `value` on `\n` into logical lines, wraps each according to
 * `opts.wrap`, builds per-row metadata, and returns the layout plus
 * caret-position translation maps.
 *
 * Empty logical lines (consecutive `\n`s, leading/trailing `\n`)
 * each produce ONE zero-cell visual row so the caret can sit on
 * them — without that, an empty line would have no row and the
 * caret would visually skip it.
 *
 * Width 0 returns no rows; the caller should treat this as
 * "container too small to render" and render nothing rather than
 * crash.
 */
export function buildWrapLayout(value: string, opts: WrapOptions): WrapLayout {
  const { width, wrap = 'word', wordBoundaries = 'whitespace' } = opts
  if (width <= 0) {
    return {
      rows: [],
      logicalToVisual: () => ({ row: 0, col: 0 }),
      visualToLogical: () => 0,
    }
  }

  const wrapper =
    wrap === 'char'
      ? (line: string, w: number) => wrapByCells(line, w)
      : (line: string, w: number) => wrapByWords(line, w, wordBoundaries)
  const logicalLines = value.split('\n')
  const rows: VisualRow[] = []
  // Walking pointer into the buffer. Advances by row.text.length per
  // emitted row + 1 per `\n` between logical lines.
  let bufferPos = 0

  for (let lineIdx = 0; lineIdx < logicalLines.length; lineIdx++) {
    const line = logicalLines[lineIdx]!
    if (line.length === 0) {
      // Empty logical line → one zero-cell visual row. Without this
      // the caret can't sit on the empty line.
      rows.push({
        text: '',
        logicalLine: lineIdx,
        startCharIdx: bufferPos,
        endCharIdx: bufferPos,
        isWrapContinuation: false,
      })
    } else {
      const wrapped = wrapper(line, width)
      // wrapByWords/wrapByCells return [] for empty input; we
      // already handled that above. For non-empty input they always
      // return at least one row.
      let rowStart = bufferPos
      for (let i = 0; i < wrapped.length; i++) {
        const text = wrapped[i]!
        rows.push({
          text,
          logicalLine: lineIdx,
          startCharIdx: rowStart,
          endCharIdx: rowStart + text.length,
          isWrapContinuation: i > 0,
        })
        rowStart += text.length
      }
    }
    bufferPos += line.length
    // Account for the `\n` between this logical line and the next.
    if (lineIdx < logicalLines.length - 1) bufferPos += 1
  }

  // ── Position translation maps ──────────────────────────────────

  // Compute cell column from a row's text given a char offset INTO
  // the row. Walks graphemes, summing widths. Used by both maps.
  const cellsBefore = (text: string, charOffset: number): number => {
    if (charOffset <= 0) return 0
    if (charOffset >= text.length) return stringWidth(text)
    return stringWidth(text.slice(0, charOffset))
  }

  const logicalToVisual = (charIdx: number): { row: number; col: number } => {
    if (rows.length === 0) return { row: 0, col: 0 }
    // Clamp negative to start.
    if (charIdx <= 0) return { row: 0, col: 0 }
    // Clamp past end to last row's end.
    const lastRow = rows[rows.length - 1]!
    if (charIdx >= lastRow.endCharIdx) {
      return {
        row: rows.length - 1,
        col: cellsBefore(lastRow.text, charIdx - lastRow.startCharIdx),
      }
    }

    // Find the row containing charIdx. Convention: at a wrap
    // boundary (charIdx === a row's startCharIdx AND the previous
    // row's endCharIdx), prefer the START of the new row — visually
    // clearer than "cursor past last char of previous row." Doesn't
    // apply to `\n` boundaries because those have a 1-char gap
    // (the \n itself), so the boundary char-idx differs.
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]!
      if (charIdx >= r.startCharIdx && charIdx <= r.endCharIdx) {
        // Boundary case: prefer next row if this is a wrap continuation.
        if (
          charIdx === r.endCharIdx &&
          i + 1 < rows.length &&
          rows[i + 1]!.isWrapContinuation &&
          rows[i + 1]!.startCharIdx === charIdx
        ) {
          continue
        }
        return { row: i, col: cellsBefore(r.text, charIdx - r.startCharIdx) }
      }
    }
    // Defensive — shouldn't be reachable given the clamps above.
    return { row: rows.length - 1, col: cellsBefore(lastRow.text, lastRow.text.length) }
  }

  const visualToLogical = (row: number, col: number): number => {
    if (rows.length === 0) return 0
    const r = rows[Math.max(0, Math.min(row, rows.length - 1))]!
    if (col <= 0) return r.startCharIdx
    // Walk the row, sum cells until we reach `col`.
    let cellsAcc = 0
    let charsAcc = 0
    for (const { segment } of getGraphemeSegmenter().segment(r.text)) {
      const w = stringWidth(segment)
      if (cellsAcc + w > col) {
        // The grapheme would push past `col` — we land BEFORE it.
        return r.startCharIdx + charsAcc
      }
      cellsAcc += w
      charsAcc += segment.length
      if (cellsAcc === col) {
        return r.startCharIdx + charsAcc
      }
    }
    // col past row content → end of row.
    return r.endCharIdx
  }

  return { rows, logicalToVisual, visualToLogical }
}

/**
 * Compute the target buffer position when the caret moves up or down
 * one visual row, respecting "preferred column" semantics — the
 * column the caret was at when the user started a vertical movement
 * chain. So ↓ from `'abc[caret]def'` (col 6) lands at col 6 of the
 * next row if it has one, or end-of-row otherwise; subsequent ↓ that
 * crosses a SHORTER intermediate row and reaches a longer row lands
 * back at col 6, not at the shorter row's end. Standard editor
 * behavior.
 *
 * Behavior at buffer edges (matches VS Code, MS Word, most modern
 * editors; differs from vim which beeps):
 *   - ↑ from row 0 → charIdx 0 (start of buffer)
 *   - ↓ from last row → end of buffer
 *
 * Caller's contract:
 *   - Pass the caret's CURRENT preferredCol. The caller maintains
 *     this in reducer state, resetting on horizontal moves
 *     (left/right/home/end) and preserving on vertical moves.
 *   - Returned charIdx is the new caret position; preferredCol
 *     stays unchanged across the call (caller persists it as-is).
 *
 * Pure — no state inside the helper.
 */
export function nextVisualRow(
  layout: WrapLayout,
  fromCharIdx: number,
  preferredCol: number,
  direction: 'up' | 'down',
): { charIdx: number } {
  if (layout.rows.length === 0) return { charIdx: fromCharIdx }

  const visual = layout.logicalToVisual(fromCharIdx)
  const targetRow = visual.row + (direction === 'up' ? -1 : 1)

  if (targetRow < 0) {
    // Already at top — move to start of buffer.
    return { charIdx: 0 }
  }
  if (targetRow >= layout.rows.length) {
    // Already at bottom — move to end of buffer.
    const lastRow = layout.rows[layout.rows.length - 1]!
    return { charIdx: lastRow.endCharIdx }
  }

  // Land at preferredCol of the target row, clamped + snapped via
  // visualToLogical (which walks graphemes — never returns a mid-
  // wide-char position).
  return { charIdx: layout.visualToLogical(targetRow, preferredCol) }
}
