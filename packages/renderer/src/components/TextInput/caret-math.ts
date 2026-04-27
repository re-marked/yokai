/**
 * Pure helpers for the TextInput caret/selection math.
 *
 * Three coordinate systems show up:
 *
 *   - **char index**  — position within the JS string (0..length).
 *   - **cell column** — cells the cursor sits at on screen.
 *     Wide chars (CJK, emoji) take 2 cells, combining marks 0.
 *   - **(line, col)** — for multiline mode, after splitting on `\n`.
 *
 * Caret semantics: a "char index" of N means the caret sits BEFORE
 * the character at index N (i.e. between chars N-1 and N). Index 0
 * is the start of the buffer; index `buffer.length` is the end.
 *
 * Word boundaries follow the standard \w+ vs non-\w split (matches
 * Bash readline `forward-word` / `backward-word` semantics, which is
 * what most TUI users expect).
 */

import { stringWidth } from '../../stringWidth.js'

/**
 * Total cell width of a string. Wide chars count as 2, combining
 * marks as 0. Newlines are NOT special — caller is responsible for
 * splitting first if measuring per-line.
 */
export function cellWidth(s: string): number {
  return stringWidth(s)
}

/**
 * Translate a char index into a cell column. Useful for placing the
 * terminal cursor: caret is at char N → cursor goes to column
 * `cellColumnAt(buffer, N)`.
 *
 * Out-of-range (negative or > length) clamps to the boundary.
 */
export function cellColumnAt(buffer: string, charIdx: number): number {
  if (charIdx <= 0) return 0
  if (charIdx >= buffer.length) return cellWidth(buffer)
  return cellWidth(buffer.slice(0, charIdx))
}

/**
 * Inverse: given a cell column, find the char index closest to it.
 * Used for click-to-position-caret. If the click lands in the middle
 * of a wide character, the caret snaps to the LEFT edge of that
 * character (same convention web inputs use).
 */
export function charIndexAtCellColumn(buffer: string, cellCol: number): number {
  if (cellCol <= 0) return 0
  let acc = 0
  for (let i = 0; i < buffer.length; i++) {
    const w = stringWidth(buffer[i]!)
    if (acc + w > cellCol) return i
    acc += w
    if (acc === cellCol) return i + 1
  }
  return buffer.length
}

/**
 * Split a buffer on '\n' into lines. Trailing newline produces a
 * trailing empty line — matters for multiline caret math at end of
 * buffer.
 */
export function splitLines(buffer: string): string[] {
  return buffer.split('\n')
}

/**
 * Given a flat char index, return the line/col within a multiline
 * buffer. col is char-index within the line (NOT cell column).
 */
export function lineColAt(buffer: string, charIdx: number): { line: number; col: number } {
  const idx = Math.max(0, Math.min(charIdx, buffer.length))
  let line = 0
  let lineStart = 0
  for (let i = 0; i < idx; i++) {
    if (buffer[i] === '\n') {
      line++
      lineStart = i + 1
    }
  }
  return { line, col: idx - lineStart }
}

/**
 * Inverse of lineColAt: convert a line+col pair back to a flat char
 * index. col is char-index within the line. Out-of-range line clamps
 * to the last line; out-of-range col clamps to the line's length.
 */
export function charIndexAtLineCol(buffer: string, line: number, col: number): number {
  const lines = splitLines(buffer)
  const targetLine = Math.max(0, Math.min(line, lines.length - 1))
  let acc = 0
  for (let i = 0; i < targetLine; i++) {
    acc += lines[i]!.length + 1 // +1 for '\n'
  }
  const lineLen = lines[targetLine]?.length ?? 0
  return acc + Math.max(0, Math.min(col, lineLen))
}

// ── Word boundaries ──────────────────────────────────────────────────

const WORD_RE = /\w/

function isWordChar(c: string | undefined): boolean {
  return c !== undefined && WORD_RE.test(c)
}

/**
 * Find the char index at the START of the word at or before `from`.
 * If `from` is in the middle of a word, returns the word's start.
 * If `from` is in whitespace, skips back over whitespace then to the
 * preceding word's start. Returns 0 at the buffer start.
 */
export function wordBoundaryBefore(buffer: string, from: number): number {
  let i = Math.max(0, Math.min(from, buffer.length))
  // Skip whitespace immediately before the cursor.
  while (i > 0 && !isWordChar(buffer[i - 1])) i--
  // Walk back to the start of the word.
  while (i > 0 && isWordChar(buffer[i - 1])) i--
  return i
}

/**
 * Find the char index at the END of the word at or after `from`.
 * If `from` is in the middle of a word, returns the word's end.
 * If `from` is in whitespace, skips forward over whitespace then to
 * the next word's end. Returns `buffer.length` at the buffer end.
 */
export function wordBoundaryAfter(buffer: string, from: number): number {
  let i = Math.max(0, Math.min(from, buffer.length))
  // Skip whitespace immediately at the cursor.
  while (i < buffer.length && !isWordChar(buffer[i])) i++
  // Walk forward to the end of the word.
  while (i < buffer.length && isWordChar(buffer[i])) i++
  return i
}
