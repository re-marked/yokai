/**
 * Pure scroll math for TextInput. Decides where the visible window
 * should sit so the caret stays in view after every edit.
 *
 * Two axes:
 *   - **horizontal** (single-line): scroll cells; window is `width`
 *     cells wide; caret cell column must stay in `[scroll, scroll + width)`.
 *   - **vertical** (multiline):     scroll rows; window is `height`
 *     rows tall; caret row must stay in `[scroll, scroll + height)`.
 *
 * The two axes share the same caret-into-view math; only the
 * dimension differs.
 */

/**
 * Adjust a one-dimensional scroll offset so `caretPos` lands inside
 * `[scroll, scroll + windowSize)`.
 *
 * Returns the (possibly unchanged) new scroll offset. Never goes
 * negative; never scrolls past `contentSize - windowSize`.
 *
 * Convention: caret at the RIGHT edge of the window (caretPos ===
 * scroll + windowSize) is OUT OF VIEW — the caret needs to render at
 * a cell, not past the last visible cell. So the predicate is `>=`,
 * which keeps a 1-cell pad at the trailing edge.
 *
 * windowSize 0 (degenerate; user passed a zero-size box) returns 0
 * to avoid divide-by-zero noise downstream.
 */
export function scrollToKeepCaretVisible(opts: {
  scroll: number
  caretPos: number
  windowSize: number
  contentSize: number
}): number {
  const { scroll, caretPos, windowSize, contentSize } = opts
  if (windowSize <= 0) return 0
  let next = scroll
  // Caret too far left → scroll left so caret is at the leading edge.
  if (caretPos < next) next = caretPos
  // Caret too far right → scroll right so caret is at the trailing
  // (right) edge minus 1 (so the caret cell itself is visible).
  else if (caretPos >= next + windowSize) next = caretPos - windowSize + 1
  // Clamp to content bounds — never scroll past the end of content,
  // never below 0.
  const max = Math.max(0, contentSize - windowSize)
  if (next > max) next = max
  if (next < 0) next = 0
  return next
}

/**
 * Slice a row by cell column range `[fromCol, fromCol + windowSize)`,
 * preserving wide-char boundaries. If a wide character straddles the
 * leading edge, render a space in its place (since the right half
 * would visually misalign). Same for trailing edge.
 *
 * Returns the visible substring suitable for a single `<Text>`. Used
 * by single-line horizontal scroll.
 */
export function sliceRowByCells(row: string, fromCol: number, windowSize: number): string {
  if (windowSize <= 0) return ''
  if (fromCol < 0) fromCol = 0
  let out = ''
  let cellAcc = 0
  let visibleCells = 0
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!
    const w = cellWidthOfChar(ch)
    if (w === 0) {
      // Combining mark — attach to whatever was last emitted (or drop
      // if before the visible range and the base char was clipped).
      if (cellAcc > fromCol || (cellAcc === fromCol && out.length > 0)) {
        out += ch
      }
      continue
    }
    if (cellAcc + w <= fromCol) {
      cellAcc += w
      continue
    }
    if (cellAcc < fromCol) {
      // Wide char straddles leading edge → render a space for the
      // visible half so layout doesn't shift.
      out += ' '
      visibleCells += 1
      cellAcc += w
      if (visibleCells >= windowSize) break
      continue
    }
    if (visibleCells + w > windowSize) {
      // Wide char straddles trailing edge → fill remaining cells with
      // spaces and stop.
      const room = windowSize - visibleCells
      out += ' '.repeat(room)
      visibleCells += room
      break
    }
    out += ch
    visibleCells += w
    cellAcc += w
    if (visibleCells >= windowSize) break
  }
  return out
}

function cellWidthOfChar(ch: string): number {
  // Fast path for ASCII printable (always 1 cell).
  const code = ch.codePointAt(0) ?? 0
  if (code < 0x80) {
    if (code < 0x20 || code === 0x7f) return 0
    return 1
  }
  // Combining marks. We only check the most common range — full
  // Unicode combining-class detection is overkill for caret math.
  // Tests verify this against stringWidth's behavior.
  if (code >= 0x0300 && code <= 0x036f) return 0
  if (code === 0x200d) return 0 // ZWJ
  if (code >= 0xfe00 && code <= 0xfe0f) return 0 // variation selectors
  // Wide ranges (East Asian Wide / Fullwidth + emoji presentation).
  // Approximate; matches the behavior of stringWidth for these
  // ranges. Anything ambiguous defaults to 1.
  if (
    (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
    (code >= 0x2e80 && code <= 0x303e) || // CJK Radicals + symbols
    (code >= 0x3041 && code <= 0x33ff) || // Hiragana, Katakana, CJK Symbols
    (code >= 0x3400 && code <= 0x4dbf) || // CJK Extension A
    (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified
    (code >= 0xa000 && code <= 0xa4cf) || // Yi
    (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
    (code >= 0xf900 && code <= 0xfaff) || // CJK Compatibility
    (code >= 0xfe30 && code <= 0xfe4f) || // CJK Compatibility Forms
    (code >= 0xff00 && code <= 0xff60) || // Fullwidth ASCII
    (code >= 0xffe0 && code <= 0xffe6) || // Fullwidth signs
    (code >= 0x1f300 && code <= 0x1f64f) || // Emoji misc
    (code >= 0x1f680 && code <= 0x1f6ff) || // Transport + map
    (code >= 0x1f900 && code <= 0x1f9ff) // Emoji extended
  ) {
    return 2
  }
  return 1
}
