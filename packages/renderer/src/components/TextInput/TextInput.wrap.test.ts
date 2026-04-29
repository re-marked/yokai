/**
 * TextInput integration tests — state + wrap-math composed.
 *
 * The pure layers each have exhaustive unit suites:
 *   - state.test.ts    — reducer mechanics (no wrap-math knowledge)
 *   - wrap-math.test.ts — pure wrap helpers (no state machine)
 *
 * This file pins the BEHAVIORAL contract that emerges when they're
 * composed via ReducerOptions: typing past a wrap boundary, deleting
 * a char that uncrosses one, hint-marked spans surviving edits,
 * indented-wrap caret nav, the wrap-mode prop matrix flowing through
 * cleanly. Anything that requires BOTH layers to work in concert
 * lives here.
 *
 * Scope contract — what belongs here vs the other two test files:
 *   - state.test.ts:  drive `reduce`, assert state. Width irrelevant
 *                     except for wide enough to not affect nav.
 *   - wrap-math.test.ts: pure-helper invariants. No reducer, no state.
 *   - this file:      reducer + wrap-math composed. Drive `reduce`
 *                     with a width that DOES wrap, then assert that
 *                     the resulting state + a fresh layout (computed
 *                     the same way the renderer does) tell a coherent
 *                     story.
 *
 * Why not render React: the codebase pattern is "shallow constructibility
 * tests + state-machine + pure-helper", not virtual-terminal pixel
 * assertions. The integration boundary that matters is reducer ↔
 * wrap-math; the React shell is a thin dispatch layer over both.
 * Component-level visual verification stays in the demo
 * (`pnpm demo:text-input`).
 */

import { describe, expect, it } from 'vitest'
import {
  type Action,
  type ReducerOptions,
  initialState,
  reduce,
  selectedText,
  selectionOrCaretRange,
} from './state.js'
import { type WrapHint, buildWrapLayout } from './wrap-math.js'

// Realistic options — a multiline TextInput at a narrow width that
// will reliably wrap typical buffers used in these tests.
const W10: ReducerOptions = { multiline: true, maxLength: undefined, width: 10 }
const W12: ReducerOptions = { multiline: true, maxLength: undefined, width: 12 }
const W20: ReducerOptions = { multiline: true, maxLength: undefined, width: 20 }

function build(value: string, ...actions: Action[]) {
  let s = initialState(value)
  for (const a of actions) s = reduce(s, a, W10)
  return s
}

/** Re-derive the layout the renderer would build for the current
 *  state under a given options. Mirrors the `useMemo` in TextInput.tsx
 *  so the integration assertions exercise the same composition. */
function layoutOf(value: string, opts: ReducerOptions) {
  return buildWrapLayout(value, {
    width: opts.width,
    indentedWrap: opts.indentedWrap,
    wordBoundaries: opts.wordBoundaries,
    hints: opts.hints,
  })
}

// ── Editing across wrap boundaries ───────────────────────────────────

describe('TextInput integration: editing across wrap boundaries', () => {
  it('typing past the wrap boundary creates a new visual row, caret follows', () => {
    // Empty buffer at width 10. Type 12 a's. The buffer wraps to two
    // visual rows (10 + 2). Caret ends on the continuation row.
    let s = initialState('')
    s = reduce(s, { type: 'insertText', text: 'a'.repeat(12) }, W10)
    expect(s.value).toBe('a'.repeat(12))
    expect(s.caret).toBe(12)

    const layout = layoutOf(s.value, W10)
    expect(layout.rows.length).toBe(2)
    const visCaret = layout.logicalToVisual(s.caret)
    expect(visCaret.row).toBe(1)
    expect(visCaret.col).toBe(2)
  })

  it('backspace that crosses BACK over the wrap boundary collapses the layout to one row', () => {
    // Start with 11 chars (wraps to 2 rows: 10 + 1). Backspace twice
    // → 9 chars → fits in 1 row. Caret on row 0 at col 9.
    let s = build('a'.repeat(11))
    s = reduce(s, { type: 'moveCaret', direction: 'docEnd', extend: false }, W10)
    s = reduce(s, { type: 'deleteBackward' }, W10)
    s = reduce(s, { type: 'deleteBackward' }, W10)
    expect(s.value).toBe('a'.repeat(9))

    const layout = layoutOf(s.value, W10)
    expect(layout.rows.length).toBe(1)
    expect(layout.logicalToVisual(s.caret)).toEqual({ row: 0, col: 9 })
  })

  it('delete forward at end of a visual row joins the buffer; layout reflows', () => {
    // 'aaaaa bbbbb ccccc' (17 chars, 3 words). Width 12 wraps to two
    // rows: 'aaaaa bbbbb ' / 'ccccc'. Place caret at idx 11 (the
    // space before 'ccccc'). Forward-delete the space — the buffer
    // becomes 'aaaaa bbbbbccccc' (16 chars), still wraps to 2 rows
    // but at a different boundary because 'bbbbbccccc' is a single
    // long token now.
    let s = initialState('aaaaa bbbbb ccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 11, extend: false }, W12)
    s = reduce(s, { type: 'deleteForward' }, W12)
    expect(s.value).toBe('aaaaa bbbbbccccc')
    expect(s.caret).toBe(11)

    const layout = layoutOf(s.value, W12)
    expect(layout.rows.length).toBeGreaterThan(1)
    // The 11-char token 'bbbbbccccc' is now atomic from word-wrap's
    // perspective — but it's longer than width 12 minus 'aaaaa '
    // (6 chars, 6 cells)? No: 'aaaaa bbbbbccccc' fits as
    // 'aaaaa ' (6) on row 0 if 'bbbbbccccc' (11) won't fit alongside
    // … 6 + 11 = 17 > 12, so word-wrap pushes 'bbbbbccccc' to row 1.
    // Then 'bbbbbccccc' is 11 cells, fits in row 1. Verify exactly.
    expect(layout.rows[0]?.text).toBe('aaaaa ')
    expect(layout.rows[1]?.text).toBe('bbbbbccccc')
  })

  it('insertText that replaces a multi-row selection: buffer and caret are coherent', () => {
    // 'aaaaaaaaaa bbbbbbbbbb' (21 chars). Width 10 wraps to:
    //   row 0: 'aaaaaaaaaa' (chars 0-10)
    //   row 1: ' '          (char 10-11) — trailing whitespace stays past width
    //   row 2: 'bbbbbbbbbb' (chars 11-21)
    // Select [5, 16] — middle of row 0 to middle of row 2 — and replace
    // with 'X'. Buffer becomes 'aaaaaXbbbbb' (11 chars), wraps to 2
    // rows. Caret ends at idx 6 (start + len of 'X').
    let s = initialState('aaaaaaaaaa bbbbbbbbbb')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, W10)
    s = reduce(s, { type: 'setCaret', charIdx: 16, extend: true }, W10)
    s = reduce(s, { type: 'insertText', text: 'X' }, W10)
    expect(s.value).toBe('aaaaaXbbbbb')
    expect(s.caret).toBe(6)
    expect(s.selection).toBeNull()

    const layout = layoutOf(s.value, W10)
    expect(layout.rows.length).toBe(2)
    expect(layout.logicalToVisual(s.caret)).toEqual({ row: 0, col: 6 })
  })
})

// ── Selection across wrap ────────────────────────────────────────────

describe('TextInput integration: selection across wrap', () => {
  it('selectionOrCaretRange returns logical range that spans multiple visual rows', () => {
    // 22 a's at width 10 → 3 rows (10 + 10 + 2). Select [3, 18] — anchor
    // on row 0 col 3, focus on row 1 col 8.
    let s = initialState('a'.repeat(22))
    s = reduce(s, { type: 'setCaret', charIdx: 3, extend: false }, W10)
    s = reduce(s, { type: 'setCaret', charIdx: 18, extend: true }, W10)

    const [start, end] = selectionOrCaretRange(s)
    expect(start).toBe(3)
    expect(end).toBe(18)

    const layout = layoutOf(s.value, W10)
    expect(layout.logicalToVisual(start).row).toBe(0)
    expect(layout.logicalToVisual(end).row).toBe(1)
    // selectedText is just the slice — wrap-agnostic by construction.
    expect(selectedText(s)).toBe('a'.repeat(15))
  })

  it('selectAll spans every visual row of a wrapped buffer', () => {
    let s = initialState('a'.repeat(25))
    s = reduce(s, { type: 'selectAll' }, W10)
    expect(s.selection).toEqual({ anchor: 0, focus: 25 })

    const layout = layoutOf(s.value, W10)
    expect(layout.rows.length).toBe(3)
    // Selection covers from row 0 col 0 to last-row last-col, inclusive
    // of every visual row in between.
    const [, end] = selectionOrCaretRange(s)
    expect(layout.logicalToVisual(end).row).toBe(layout.rows.length - 1)
  })
})

// ── Wrap mode plumbing ───────────────────────────────────────────────

describe('TextInput integration: wrap-mode props flow through ReducerOptions', () => {
  it('wordBoundaries=identifier — snake_case stays whole when only the suffix would overflow', () => {
    // 'do_something_long' (17 chars) at width 12 with identifier mode.
    // Identifier mode prefers breaking AFTER underscore. Layout should
    // break at the _ boundary, not mid-letter.
    const value = 'do_something_long'
    const opts: ReducerOptions = { ...W12, wordBoundaries: 'identifier' }
    const layout = layoutOf(value, opts)
    // Whitespace mode would char-wrap (no whitespace anywhere); identifier
    // mode finds the underscore. Verify rows split at underscore boundaries.
    expect(layout.rows.length).toBeGreaterThan(1)
    for (const row of layout.rows) {
      // No row should END mid-token (i.e., not at an _ boundary or
      // buffer end). Last row is exempt.
      if (row !== layout.rows[layout.rows.length - 1]) {
        const endsAtUnderscore = value[row.endCharIdx - 1] === '_'
        expect(endsAtUnderscore).toBe(true)
      }
    }
  })

  it('wrapHints — buffer-relative hint protects an atomic span across the layout', () => {
    // 'see chit-abc-123 done' (21 chars). Without a hint, identifier
    // mode would happily break at hyphens inside chit-abc-123.
    // A hint covering [4, 16] forbids breaks inside that range,
    // forcing the wrap to land elsewhere.
    const value = 'see chit-abc-123 done'
    const hints: WrapHint[] = [{ start: 4, end: 16 }]
    const opts: ReducerOptions = { ...W12, wordBoundaries: 'identifier', hints }
    const layout = layoutOf(value, opts)

    // No row should split inside the hinted range.
    for (const row of layout.rows) {
      const splitsHint = row.endCharIdx > 4 && row.endCharIdx < 16
      expect(splitsHint).toBe(false)
    }
  })

  it('indentedWrap — caret nav from row 0 down to a continuation row clamps preferredCol to display col', () => {
    // '    apple banana' (16 chars, 4 leading spaces). Width 12 +
    // indentedWrap=true → row 0 'apple ' decoration omitted (it's a
    // first row), row 1 has 4 indent cells of decoration before
    // 'banana'. Place caret on row 0 at display col 8 (idx 8 = 'e' in
    // 'apple'). Press Down. The caret should land in the continuation
    // row — but at display col 8, which is INSIDE the indent
    // decoration. visualToLogical clicks-inside-indent snap to row
    // content start, so caret lands at the start of 'banana' (idx 10).
    const value = '    apple banana'
    const opts: ReducerOptions = { ...W12, indentedWrap: true }
    let s = initialState(value)
    s = reduce(s, { type: 'setCaret', charIdx: 8, extend: false }, opts)
    expect(s.preferredCol).toBeNull()
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, opts)

    // preferredCol captured from row 0 display col 8.
    expect(s.preferredCol).toBe(8)
    // Caret on continuation row. The exact char idx depends on
    // visualToLogical's indent-clamp rule: display col 8, indent is
    // 4, so text-internal col is 4. Continuation row text is
    // 'banana' starting at idx 10. col 4 within 'banana' = idx 14.
    const layout = layoutOf(s.value, opts)
    const visCaret = layout.logicalToVisual(s.caret)
    expect(visCaret.row).toBe(1)
    expect(s.caret).toBe(14)
  })
})

// ── Soft-wrap edge cases ─────────────────────────────────────────────

describe('TextInput integration: soft-wrap edge cases', () => {
  it('CJK at row boundary — packs by cells, never splits a 2-cell grapheme', () => {
    // '中文测试日本' = 6 chars × 2 cells = 12 cells. Width 8 = 4 chars per
    // row. Two rows of 4 chars each, no straddling.
    const value = '中文测试日本'
    let s = initialState(value)
    s = reduce(s, { type: 'setCaret', charIdx: 4, extend: false }, { ...W10, width: 8 })
    expect(s.caret).toBe(4)

    const layout = buildWrapLayout(value, { width: 8 })
    expect(layout.rows.length).toBe(2)
    expect(layout.rows[0]?.text).toBe('中文测试')
    expect(layout.rows[1]?.text).toBe('日本')
    // Caret at idx 4 is exactly at the row boundary. Per the wrap
    // convention, position-at-wrap-boundary prefers START of next row.
    expect(layout.logicalToVisual(s.caret)).toEqual({ row: 1, col: 0 })
  })

  it('emoji + ASCII mix — surrogate pairs stay together at wrap boundaries', () => {
    // 'a😀b😀c' — 'a' (1 cell), '😀' (2 cells, 2 UTF-16 units),
    // 'b' (1), '😀' (2), 'c' (1). 7 cells total. Width 3 forces the
    // tightest packing where the emoji fills row capacity:
    //   row 0: 'a😀' (3 cells, 3 chars: a + surrogate pair)
    //   row 1: 'b😀' (3 cells, 3 chars)
    //   row 2: 'c'   (1 cell)
    // The grapheme segmenter ensures each emoji lands intact on
    // exactly one row — no row text contains a lone surrogate.
    const value = 'a😀b😀c'
    const layout = buildWrapLayout(value, { width: 3 })
    expect(layout.rows.length).toBe(3)
    expect(layout.rows[0]?.text).toBe('a😀')
    expect(layout.rows[1]?.text).toBe('b😀')
    expect(layout.rows[2]?.text).toBe('c')
    // Rejoin: rows concat = original buffer (no chars lost or
    // duplicated, surrogate pairs intact).
    expect(layout.rows.map((r) => r.text).join('')).toBe(value)
  })

  it('very long single token char-wraps when no whitespace break is available', () => {
    // 'supercalifragilisticexpialidocious' = 34 chars, no whitespace.
    // Width 10 falls back to char-wrap: 4 rows of 10 + 4.
    const value = 'supercalifragilisticexpialidocious'
    const layout = buildWrapLayout(value, { width: 10 })
    expect(layout.rows.length).toBe(4)
    expect(layout.rows[0]?.text.length).toBe(10)
    expect(layout.rows[1]?.text.length).toBe(10)
    expect(layout.rows[2]?.text.length).toBe(10)
    expect(layout.rows[3]?.text.length).toBe(4)
  })

  it('consecutive newlines produce empty visual rows the caret can sit on', () => {
    // '\n\n\n' is 3 newlines → 4 logical lines (all empty) → 4 visual
    // rows of zero cells. Caret can land on each.
    const value = '\n\n\n'
    const s = initialState(value) // caret at end = 3
    expect(s.caret).toBe(3)

    const layout = buildWrapLayout(value, { width: 20 })
    expect(layout.rows.length).toBe(4)
    for (const row of layout.rows) expect(row.text).toBe('')

    // Each char idx maps to a distinct row (caret placement on each
    // empty line works).
    expect(layout.logicalToVisual(0)).toEqual({ row: 0, col: 0 })
    expect(layout.logicalToVisual(1)).toEqual({ row: 1, col: 0 })
    expect(layout.logicalToVisual(2)).toEqual({ row: 2, col: 0 })
    expect(layout.logicalToVisual(3)).toEqual({ row: 3, col: 0 })
  })

  it('width=0 — first-frame fallback: edits still apply, layout returns no rows', () => {
    // Yoga hasn't measured yet. Reducer accepts edits; caret nav
    // falls back to logical-line walk; layout is empty but doesn't
    // crash.
    const ZERO: ReducerOptions = { multiline: true, maxLength: undefined, width: 0 }
    let s = initialState('hello\nworld')
    s = reduce(s, { type: 'insertText', text: 'X' }, ZERO)
    expect(s.value).toBe('hello\nworldX')

    const layout = buildWrapLayout(s.value, { width: 0 })
    expect(layout.rows.length).toBe(0)
    // Safe-fallback maps return {0,0} / 0 — no crash.
    expect(layout.logicalToVisual(s.caret)).toEqual({ row: 0, col: 0 })
    expect(layout.visualToLogical(0, 0)).toBe(0)
  })

  it('hint span wider than width — no break inside, rejoin holds, terminates', () => {
    // A hinted span longer than `width` cannot be broken AT ALL —
    // wrap math must accept the overflow rather than dropping content
    // or looping. Verify (a) no row breaks INSIDE the hint range,
    // (b) the rejoin invariant survives, (c) the layout terminates.
    const value = 'pre veryLongAtomicWord post'
    // 'veryLongAtomicWord' = chars 4-22 (18 chars). Hint covers the
    // full word.
    const hints: WrapHint[] = [{ start: 4, end: 22 }]
    const layout = buildWrapLayout(value, { width: 10, hints })

    // No row may end strictly inside the hint range — that would be
    // a break inside the atomic span.
    for (const row of layout.rows) {
      const splitsHint = row.endCharIdx > 4 && row.endCharIdx < 22
      expect(splitsHint).toBe(false)
    }
    // Rejoin: rows concat = original buffer.
    expect(layout.rows.map((r) => r.text).join('')).toBe(value)
  })
})

// ── Realistic editing flow ───────────────────────────────────────────

describe('TextInput integration: realistic editing scenario', () => {
  it('compose: type long content, navigate up across visual rows, edit mid-row, navigate down', () => {
    // Empty buffer at width 12. Type two long words — verify wrap.
    // Navigate up — verify caret lands on a continuation row at the
    // preferred col. Insert a char — verify wrap reflows. Navigate
    // down — verify caret lands at preferredCol (clamped to row).
    let s = initialState('')
    s = reduce(s, { type: 'insertText', text: 'aaaaaaaaaaaaa bbbbbbbbbbbbb' }, W12)
    expect(s.value).toBe('aaaaaaaaaaaaa bbbbbbbbbbbbb')
    expect(s.caret).toBe(27)

    // 'aaaaaaaaaaaaa bbbbbbbbbbbbb' is 27 chars at width 12.
    // wrapByWords: try to fit 12 cells in row 0. First word is 13
    // chars (longer than width) — char-wrap fallback for it. So row
    // 0 = 'aaaaaaaaaaaa' (12), row 1 = 'a ' (2), row 2 = a chunk
    // of bbb... — let's not pin exact wrapping, just verify >= 3 rows
    // and the buffer is intact.
    const layout1 = layoutOf(s.value, W12)
    expect(layout1.rows.length).toBeGreaterThanOrEqual(3)

    // Move up — caret moves through visual rows.
    const visCaret1 = layout1.logicalToVisual(s.caret)
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, W12)
    expect(s.preferredCol).toBe(visCaret1.col)
    const layout2 = layoutOf(s.value, W12)
    const visCaret2 = layout2.logicalToVisual(s.caret)
    expect(visCaret2.row).toBe(visCaret1.row - 1)

    // Insert a char mid-row. preferredCol resets per the outer
    // reduce wrapper. Buffer grows by one.
    s = reduce(s, { type: 'insertText', text: 'X' }, W12)
    expect(s.value.length).toBe(28)
    expect(s.preferredCol).toBeNull()

    // Move down — preferredCol re-captures from the new caret pos.
    const layout3 = layoutOf(s.value, W12)
    const visCaret3 = layout3.logicalToVisual(s.caret)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, W12)
    expect(s.preferredCol).toBe(visCaret3.col)

    const layout4 = layoutOf(s.value, W12)
    const visCaret4 = layout4.logicalToVisual(s.caret)
    expect(visCaret4.row).toBe(visCaret3.row + 1)
  })

  it('selection-then-replace round-trip: visual position consistent after each step', () => {
    // Type, select mid-buffer, replace with a longer string, verify
    // the caret + selection state and visual position all line up.
    let s = initialState('hello world hello world')
    // Place caret on row 0 col 6 (start of first 'world'). Width 20
    // wraps to two rows: 'hello world hello ' (18 chars + trailing
    // space stays past width per HTML/CSS pre-wrap convention) +
    // 'world' (5).
    s = reduce(s, { type: 'setCaret', charIdx: 6, extend: false }, W20)
    s = reduce(s, { type: 'setCaret', charIdx: 17, extend: true }, W20)
    expect(selectedText(s)).toBe('world hello')

    // Replace the selection.
    s = reduce(s, { type: 'insertText', text: 'BYE' }, W20)
    expect(s.value).toBe('hello BYE world')
    expect(s.caret).toBe(9)
    expect(s.selection).toBeNull()

    const layout = layoutOf(s.value, W20)
    expect(layout.rows.length).toBe(1) // 15 chars now fits
    expect(layout.logicalToVisual(s.caret)).toEqual({ row: 0, col: 9 })
  })
})
