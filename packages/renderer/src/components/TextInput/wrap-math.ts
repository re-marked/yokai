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

import { getGraphemeSegmenter } from '@yokai-tui/shared'
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
export function wrapByCells(
  text: string,
  width: number,
  /** Optional atomic spans (line-relative). When provided, wrap
   *  decisions never break INSIDE a span — if normal char-wrap would
   *  land inside, the row is rolled back to the last safe (outside-
   *  span) break point and the span moves to the next row. If the
   *  span itself is wider than `width`, it overflows on its own row(s)
   *  rather than being split. Same contract `wrapByWords` honors —
   *  required for `WrapHint`s to behave consistently in both wrap
   *  modes. */
  atomicSpans: ReadonlyArray<readonly [number, number]> = [],
): string[] {
  if (width <= 0) return []
  if (text.length === 0) return []

  const rows: string[] = []
  let currentRow = ''
  let currentWidth = 0
  // Char-index within `currentRow` of the last position that's
  // OUTSIDE all atomic spans — i.e., a position where breaking is
  // allowed. Updated each time we add a grapheme that lands outside
  // any span. Used as the rollback target when we need to break but
  // the natural break-point lies inside a span.
  let lastSafeBreakIdx = 0
  // Walking pointer — `text`-absolute char index where the current
  // row begins. Translates row-internal positions to span-absolute
  // for the inside-range check.
  let rowAbsStart = 0

  for (const { segment } of getGraphemeSegmenter().segment(text)) {
    const w = stringWidth(segment)
    const absPosBefore = rowAbsStart + currentRow.length

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
        rowAbsStart += currentRow.length
        rows.push(currentRow)
      }
      rows.push(segment)
      rowAbsStart += segment.length
      currentRow = ''
      currentWidth = 0
      lastSafeBreakIdx = 0
      continue
    }

    // Adding this grapheme would overflow → break.
    if (currentWidth + w > width) {
      // If the natural break point (current position, before adding
      // this grapheme) is inside an atomic span, roll back to the
      // last safe break (outside any span). If there's none, accept
      // the overflow — the span is wider than width and there's no
      // clean way to split it. `lastSafeBreakIdx === 0` means either
      // the row started inside a span OR no safe break was recorded;
      // in both cases we just keep adding (the span will continue
      // overflowing).
      const breakingInsideSpan = isInsideRange(atomicSpans, absPosBefore)
      if (breakingInsideSpan && lastSafeBreakIdx > 0) {
        // Roll back — push everything before the span, carry the
        // partial-span overhang to the next row plus the current
        // grapheme.
        const pushed = currentRow.slice(0, lastSafeBreakIdx)
        const overhang = currentRow.slice(lastSafeBreakIdx)
        rows.push(pushed)
        rowAbsStart += pushed.length
        currentRow = overhang + segment
        currentWidth = stringWidth(currentRow)
        lastSafeBreakIdx = 0
        continue
      }
      if (breakingInsideSpan) {
        // No safe break — accept overflow. The whole span (wider
        // than width) ends up on its own row(s).
        currentRow += segment
        currentWidth += w
        continue
      }
      // Normal break: position is outside any span.
      rowAbsStart += currentRow.length
      rows.push(currentRow)
      currentRow = segment
      currentWidth = w
      lastSafeBreakIdx = 0
      continue
    }

    // Fits in the current row. Record this as a safe break candidate
    // if the position AFTER this grapheme is outside any span (the
    // position-after is where a future break would land).
    currentRow += segment
    currentWidth += w
    if (atomicSpans.length === 0 || !isInsideRange(atomicSpans, rowAbsStart + currentRow.length)) {
      lastSafeBreakIdx = currentRow.length
    }
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

/**
 * A consumer-supplied wrap hint marks a buffer range where the wrap
 * algorithm should NOT break. Used to keep semantically-atomic
 * content together — mention chips (`@toast`), chit-id refs
 * (`chit-abc-123`), code spans, etc.
 *
 * Hints are buffer-relative: `start` and `end` are char indices into
 * the full TextInput value, not into any per-line slice. The wrap
 * layout intersects hints with each logical line's range
 * automatically. Empty / inverted ranges (`end <= start`) are
 * silently ignored.
 *
 * `joinWith`: the field is reserved for inserting a glyph at the
 * forced break point when an unbreakable span is wider than `width`
 * (e.g. `'-'` to render a soft hyphen inside an over-wide identifier).
 * NOT IMPLEMENTED in this PR — requires renderer-side glyph injection
 * outside the wrap-math layer; tracked for the soft-wrap follow-up.
 * The field is on the type so consumers can wire it now and start
 * benefiting once the render integration lands, with no breaking change.
 */
export type WrapHint = {
  start: number
  end: number
  joinWith?: string
}

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
  /** Caller-supplied atomic spans (line-relative) — positions inside
   *  these ranges are NEVER break candidates. Combined with URL
   *  detection in identifier mode. Pass `[]` (or omit) for no hints. */
  atomicSpans: ReadonlyArray<readonly [number, number]> = [],
): string[] {
  if (width <= 0) return []
  if (text.length === 0) return []

  // Identifier mode: precompute URL atomic spans up front. Cheaper
  // than a regex.test per grapheme, and most lines have zero URLs.
  // Combine with caller-supplied atomic spans (from wrap hints) so
  // the avoid check is one isInsideRange call per grapheme.
  const urlRanges = boundaries === 'identifier' ? findUrlRanges(text) : []
  const allAtomicSpans: ReadonlyArray<readonly [number, number]> =
    atomicSpans.length === 0 ? urlRanges : [...urlRanges, ...atomicSpans]

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
      // Whitespace always fits past width — trailing whitespace stays
      // on the row it terminates rather than wrapping onto a new row.
      // Matches HTML/CSS pre-wrap convention. The renderer side clips
      // the visible cells to box width so trailing whitespace past
      // width is invisible rather than triggering an ellipsis.
      //
      // Why this matters for UX: when the user types text in a field
      // and content wraps, the trailing space between the last word
      // and the wrapped word stays on the previous row rather than
      // jumping to the start of the new row as more characters are
      // added. Spaces are visual nothing — they shouldn't reflow
      // surrounding content.
      //
      // Whitespace is recorded as a HARD break candidate regardless of
      // hasContent. Earlier versions guarded with `hasContent` to keep
      // leading-whitespace-+-first-word atomic (so '  hello' stays as
      // one row even when it'd overflow), but that produced ugly mid-
      // word char-wrap when the row really did overflow ('      app
      // ban' at width 6 broke 'app' into 'a'+'p'+'p' instead of
      // wrapping after the leading spaces). Without the guard, leading
      // whitespace becomes a break point ONLY when overflow forces it
      // — fitting rows still keep leading whitespace + first word
      // together (no overflow → brk never used).
      //
      // Atomic-span exception: still skip recording when inside a
      // wrap hint range — consumers explicitly bound those positions
      // together.
      row += segment
      rowWidth += w
      if (!isInsideRange(allAtomicSpans, absPosBefore)) {
        lastBreakIdx = row.length
        lastBreakIsHard = true
      }
      prevChar = segment[0]
      continue
    }

    // Identifier-mode soft break check: is the position BEFORE the
    // current grapheme a preferred break? If so, record it (but only
    // if no harder break is already known later in the row).
    // Atomic-span check is inside classifyIdentifierBoundary — passes
    // 'avoid' which we skip below.
    if (boundaries === 'identifier' && hasContent && prevChar !== undefined) {
      const kind = classifyIdentifierBoundary(prevChar, segment[0], absPosBefore, allAtomicSpans)
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
      } else if (isInsideRange(allAtomicSpans, absPosBefore)) {
        // Overflow with no break candidate AND we're inside an atomic
        // span. Splitting here would violate the atomic-span contract
        // ("NEVER break inside; if span > width, overflow on its own
        // row" — same rule wrapByCells honors via lastSafeBreakIdx
        // rollback). Defer the wrap by accepting the overflow in the
        // current row; we'll push at the next safe break (whitespace
        // exiting the span, or end of buffer).
        row += segment
        rowWidth += w
        hasContent = true
        prevChar = segment[segment.length - 1]
        continue
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
  /** Number of cells of indent the renderer should prepend BEFORE
   *  `text` when displaying this row. Always 0 for non-continuation
   *  rows (their leading whitespace IS already in `text`). For
   *  continuation rows under hanging-indent mode, this is the cell
   *  width of the original logical line's leading whitespace —
   *  rendering ` `.repeat(indentCells) + text aligns the
   *  continuation under the first non-whitespace character of the
   *  original line. The buffer's char positions are unaffected
   *  (the indent is a render decoration, not in the buffer at this
   *  position). */
  readonly indentCells: number
}

/** Detect the leading-whitespace prefix of a logical line, returning
 *  both the prefix string (for prepending to continuation rows) and
 *  its cell width. Stops at the first non-whitespace grapheme.
 *
 *  Only ASCII space + tab count (matches `isBreakableWhitespace`'s
 *  conservative definition — non-breaking space and figure space
 *  are intentionally NOT treated as indent because they're meant to
 *  bind tokens, not delimit visual structure).
 *
 *  Used by buildWrapLayout for hanging-indent ("breakindent" in
 *  vim, "indented wrap" in VS Code) — continuation rows of a wrapped
 *  logical line visually align under the first non-whitespace
 *  character of the original line.
 */
function detectLeadingIndent(line: string): { prefix: string; cells: number } {
  let prefix = ''
  let cells = 0
  for (const { segment } of getGraphemeSegmenter().segment(line)) {
    if (!isBreakableWhitespace(segment)) break
    prefix += segment
    cells += stringWidth(segment)
  }
  return { prefix, cells }
}

/** Output of `buildWrapLayout`. The `rows` array is the rendering
 *  source-of-truth; the two map functions handle caret positioning.
 *
 *  **Column convention (both maps).** Columns are TRUE DISPLAY CELLS
 *  — they include any `indentCells` rendered as a leading prefix on
 *  continuation rows. So a caller can pass / receive cell coordinates
 *  identical to what's painted on the screen, no manual offset
 *  arithmetic needed. The functions add / subtract `indentCells`
 *  internally based on the row's metadata. */
export type WrapLayout = {
  readonly rows: ReadonlyArray<VisualRow>
  /** Translate a buffer char index to (visualRow, visualCol). The
   *  column is in DISPLAY CELLS — already includes the row's
   *  `indentCells` for continuation rows. At a wrap boundary
   *  (charIdx is the start of a continuation row), returns the
   *  START of the new row, not the end of the previous — visually
   *  clearer to the user where the caret is. */
  readonly logicalToVisual: (charIdx: number) => { row: number; col: number }
  /** Translate a visual (row, col) cell coordinate back to a buffer
   *  char index. `col` is in DISPLAY CELLS — clicks that land inside
   *  a continuation row's indent decoration (col < `indentCells`)
   *  snap to the start of the row's content. Used by
   *  click-to-position. Clamps past-end col to row.endCharIdx. */
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
  /** Programmatic wrap hints — buffer-relative atomic spans the
   *  wrap algorithm must NOT break inside. See `WrapHint`. */
  hints?: ReadonlyArray<WrapHint>
  /** Hanging-indent ("indented wrap" / vim's `breakindent`) — when
   *  a logical line wraps, continuation rows visually align under
   *  the first non-whitespace character of the original line. The
   *  indent isn't inserted into the buffer; the renderer prepends
   *  spaces at render time using `VisualRow.indentCells`.
   *
   *  Default `true` — matches what every modern editor does for
   *  prose / list / quote / indented-code content. Set `false` for
   *  the unindented behavior (continuation rows start at column 0). */
  indentedWrap?: boolean
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
  const { width, wrap = 'word', wordBoundaries = 'whitespace', hints, indentedWrap = true } = opts
  if (width <= 0) {
    return {
      rows: [],
      logicalToVisual: () => ({ row: 0, col: 0 }),
      visualToLogical: () => 0,
    }
  }

  // Normalize hints once: drop empty/inverted ranges; sort by start
  // for predictable intersection scans. Per-line slicing happens
  // inside the loop (cheap — we have at most a few hints typically).
  const normalizedHints: ReadonlyArray<WrapHint> = (hints ?? [])
    .filter((h) => h.end > h.start)
    .slice()
    .sort((a, b) => a.start - b.start)

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
        indentCells: 0,
      })
    } else {
      // Translate buffer-relative hints into line-relative atomic
      // spans for wrapByWords. A hint that overlaps this line gets
      // clipped to the line's range; hints entirely outside are
      // skipped.
      const lineStart = bufferPos
      const lineEnd = bufferPos + line.length
      const lineAtomicSpans: Array<readonly [number, number]> = []
      for (const h of normalizedHints) {
        if (h.end <= lineStart) continue // before this line
        if (h.start >= lineEnd) break // after this line (sorted, so no later overlap either)
        const spanStart = Math.max(0, h.start - lineStart)
        const spanEnd = Math.min(line.length, h.end - lineStart)
        if (spanEnd > spanStart) lineAtomicSpans.push([spanStart, spanEnd] as const)
      }

      // Hanging indent: detect leading whitespace, wrap CONTENT at
      // the reduced width. The first row's text includes the prefix
      // (it's in the buffer at this position); continuation rows
      // store `indentCells` so the renderer prepends spaces at
      // render time. Atomic-span positions inside the prefix slice
      // (rare — would require a hint covering leading whitespace)
      // are simply offset by -prefix.length when passed to wrap.
      //
      // Threshold: we only apply hanging indent when the indent leaves
      // at least HALF the row available for content. Beyond that the
      // continuation rows get so squeezed they'd char-wrap to single-
      // or two-cell strips — visually worse than just abandoning the
      // hanging-indent decoration and letting the line wrap normally
      // at column 0. Same idea as vim's `breakindentopt=min:N` — we
      // hardcode the threshold to width/2 because exposing it as a
      // tunable adds API surface without much real-world benefit.
      const indent =
        indentedWrap && wrap === 'word' ? detectLeadingIndent(line) : { prefix: '', cells: 0 }
      const minContentWidth = Math.ceil(width / 2)
      const usingIndent = indent.cells > 0 && width - indent.cells >= minContentWidth
      const contentLine = usingIndent ? line.slice(indent.prefix.length) : line
      const contentWidth = usingIndent ? width - indent.cells : width
      // Translate atomic spans to content-relative if we stripped a prefix.
      const contentSpans: Array<readonly [number, number]> = usingIndent
        ? lineAtomicSpans
            .map(
              ([s, e]) =>
                [
                  Math.max(0, s - indent.prefix.length),
                  Math.max(0, e - indent.prefix.length),
                ] as const,
            )
            .filter(([s, e]) => e > s)
        : lineAtomicSpans

      const wrapped =
        wrap === 'char'
          ? wrapByCells(contentLine, contentWidth, contentSpans)
          : wrapByWords(contentLine, contentWidth, wordBoundaries, contentSpans)

      // Edge case: all-whitespace line. detectLeadingIndent consumes
      // everything; contentLine is "". wrapByWords returns []. Emit
      // one row with the whitespace as text so the caret can sit on it.
      if (wrapped.length === 0) {
        rows.push({
          text: line,
          logicalLine: lineIdx,
          startCharIdx: bufferPos,
          endCharIdx: bufferPos + line.length,
          isWrapContinuation: false,
          indentCells: 0,
        })
      } else {
        let rowStart = bufferPos
        for (let i = 0; i < wrapped.length; i++) {
          const contentText = wrapped[i]!
          // First row: text includes the prefix (prepend it). Indent
          // cells = 0 because the prefix IS in the text already.
          // Continuation rows: text is just content; indentCells is
          // the prefix's cell width (renderer prepends spaces).
          const text = i === 0 && usingIndent ? indent.prefix + contentText : contentText
          rows.push({
            text,
            logicalLine: lineIdx,
            startCharIdx: rowStart,
            endCharIdx: rowStart + text.length,
            isWrapContinuation: i > 0,
            // Only continuation rows get a render-time indent, AND
            // only when we actually applied the indent strategy. When
            // the threshold rejected indent, this stays 0 even though
            // the detected prefix had cells.
            indentCells: usingIndent && i > 0 ? indent.cells : 0,
          })
          rowStart += text.length
        }
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
        col: lastRow.indentCells + cellsBefore(lastRow.text, charIdx - lastRow.startCharIdx),
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
        // Display col = indent decoration + text-internal col.
        return {
          row: i,
          col: r.indentCells + cellsBefore(r.text, charIdx - r.startCharIdx),
        }
      }
    }
    // Defensive — shouldn't be reachable given the clamps above.
    return {
      row: rows.length - 1,
      col: lastRow.indentCells + cellsBefore(lastRow.text, lastRow.text.length),
    }
  }

  const visualToLogical = (row: number, col: number): number => {
    if (rows.length === 0) return 0
    const r = rows[Math.max(0, Math.min(row, rows.length - 1))]!
    // Strip the indent decoration from `col` to get a text-internal
    // column. A click that lands inside the indent (col < indentCells)
    // maps to the row's content start — semantically "user clicked
    // before any actual character of this row."
    const textCol = Math.max(0, col - r.indentCells)
    if (textCol === 0) return r.startCharIdx
    // Walk the row, sum cells until we reach `textCol`.
    let cellsAcc = 0
    let charsAcc = 0
    for (const { segment } of getGraphemeSegmenter().segment(r.text)) {
      const w = stringWidth(segment)
      if (cellsAcc + w > textCol) {
        // The grapheme would push past `textCol` — we land BEFORE it.
        return r.startCharIdx + charsAcc
      }
      cellsAcc += w
      charsAcc += segment.length
      if (cellsAcc === textCol) {
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
