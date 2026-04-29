/**
 * Tests for the pure clipboard-decision helper. Every cell of the
 * matrix in clipboard-action.ts is covered, plus the no-op cases for
 * keys this helper doesn't claim (Ctrl+V, Ctrl+Shift+C, modifier-less
 * 'c').
 */

import { describe, expect, it } from 'vitest'
import { type ClipboardKeyInput, clipboardKeyAction } from './clipboard-action.js'
import { type TextInputState, initialState, reduce } from './state.js'
import { buildWrapLayout } from './wrap-math.js'

// width is required by ReducerOptions but irrelevant here — these
// tests only build state via setCaret to seed selection ranges.
const opts = { multiline: false, maxLength: undefined, width: 80 }

function withSelection(value: string, anchor: number, focus: number): TextInputState {
  // Build state through the reducer so selection invariants hold.
  let s = initialState(value)
  s = reduce(s, { type: 'setCaret', charIdx: anchor, extend: false }, opts)
  s = reduce(s, { type: 'setCaret', charIdx: focus, extend: true }, opts)
  return s
}

function withCaret(value: string, caret: number): TextInputState {
  let s = initialState(value)
  s = reduce(s, { type: 'setCaret', charIdx: caret, extend: false }, opts)
  return s
}

const ctrlC: ClipboardKeyInput = { ctrl: true, shift: false, key: 'c' }
const ctrlX: ClipboardKeyInput = { ctrl: true, shift: false, key: 'x' }

describe('clipboardKeyAction', () => {
  describe('returns null for non-clipboard keys', () => {
    it('null on plain c / x without ctrl', () => {
      const s = withSelection('hello', 0, 3)
      expect(clipboardKeyAction({ ctrl: false, shift: false, key: 'c' }, s, false)).toBeNull()
      expect(clipboardKeyAction({ ctrl: false, shift: false, key: 'x' }, s, false)).toBeNull()
    })

    it('null on Ctrl+Shift+C / Ctrl+Shift+X (reserved for terminal-side bindings)', () => {
      const s = withSelection('hello', 0, 3)
      expect(clipboardKeyAction({ ctrl: true, shift: true, key: 'c' }, s, false)).toBeNull()
      expect(clipboardKeyAction({ ctrl: true, shift: true, key: 'x' }, s, false)).toBeNull()
    })

    it('null on Ctrl+V (paste path lives in bracketed paste / PasteEvent, not here)', () => {
      const s = withSelection('hello', 0, 3)
      expect(clipboardKeyAction({ ctrl: true, shift: false, key: 'v' }, s, false)).toBeNull()
    })

    it('null on Ctrl + arbitrary letter', () => {
      const s = withSelection('hello', 0, 3)
      expect(clipboardKeyAction({ ctrl: true, shift: false, key: 'a' }, s, false)).toBeNull()
    })
  })

  describe('Ctrl+C', () => {
    it('copies selection text (non-password)', () => {
      const s = withSelection('hello world', 0, 5)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: 'hello' })
    })

    it('falls through with no selection (so App-level Ctrl+C exit fires)', () => {
      const s = withCaret('hello', 2)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'fallthrough' })
    })

    it('falls through in password mode with selection (no copy ever)', () => {
      // Password text never reaches clipboard, even if user selected
      // it. Falling through means the App's Ctrl+C exit fires —
      // arguably what the user meant by Ctrl+C in a password field.
      const s = withSelection('hunter2', 0, 7)
      expect(clipboardKeyAction(ctrlC, s, true)).toEqual({ kind: 'fallthrough' })
    })

    it('falls through in password mode with no selection', () => {
      const s = withCaret('hunter2', 3)
      expect(clipboardKeyAction(ctrlC, s, true)).toEqual({ kind: 'fallthrough' })
    })
  })

  describe('Ctrl+X', () => {
    it('cuts (copy + delete) with selection (non-password)', () => {
      const s = withSelection('hello world', 0, 5)
      expect(clipboardKeyAction(ctrlX, s, false)).toEqual({ kind: 'cut', text: 'hello' })
    })

    it('falls through with no selection (no-op, NO preventDefault)', () => {
      // Critical: we DON'T claim the event when we did nothing. A
      // future App-level "cut whatever's focused" binding deserves
      // to see the keystroke. preventDefault means "I handled this"
      // — doing nothing isn't handling.
      const s = withCaret('hello', 2)
      expect(clipboardKeyAction(ctrlX, s, false)).toEqual({ kind: 'fallthrough' })
    })

    it('cuts-no-copy in password mode with selection', () => {
      // Selection is deleted (normal editing — user could Backspace
      // it anyway) but password text never reaches the clipboard.
      const s = withSelection('hunter2', 0, 7)
      expect(clipboardKeyAction(ctrlX, s, true)).toEqual({ kind: 'cut-no-copy' })
    })

    it('falls through in password mode with no selection', () => {
      const s = withCaret('hunter2', 3)
      expect(clipboardKeyAction(ctrlX, s, true)).toEqual({ kind: 'fallthrough' })
    })
  })

  describe('selection text accuracy', () => {
    it('copies multiline selection (newlines preserved)', () => {
      const s = withSelection('line1\nline2', 2, 8)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: 'ne1\nli' })
    })

    it('copies emoji selection without splitting surrogate pairs', () => {
      // 😀 is at indices 0-1 (UTF-16 length 2). selectedText slices
      // by char index, so a [0, 2] selection captures the full emoji.
      const s = withSelection('😀ok', 0, 2)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: '😀' })
    })

    it('treats anchor==focus as no selection (caret-only)', () => {
      // Position the caret with no extend → state.selection is null
      // → selectedText returns ''. Should fall through.
      const s = withCaret('hello', 3)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'fallthrough' })
    })
  })

  describe('selection spanning visual rows (soft-wrap)', () => {
    // Architectural invariant: cut/copy operates on the LOGICAL char
    // buffer (`state.value.slice(start, end)`), never on the rendered
    // visual rows. Visual wrapping is purely a render-time concern;
    // the selection state stores logical char indices and the
    // clipboard sees raw buffer text.
    //
    // These tests construct buffers + selections that DEMONSTRABLY
    // span multiple visual rows under a known wrap width, verify the
    // visual-row spread via buildWrapLayout, and assert the clipboard
    // text is the contiguous buffer slice — uncorrupted by any wrap
    // artifact (no row separators injected, no indent decoration
    // bleeding in, no atomic-span boundary trickery).

    it('word-wrapped: selection across two visual rows of one logical line', () => {
      // 'aaaa bbbb cccc dddd' (19 chars). Width 10 wraps to:
      //   row 0: 'aaaa bbbb '  (chars 0-10)   ← trailing space stays at break
      //   row 1: 'cccc dddd'   (chars 10-19)
      // Selection [5, 14] = 'bbbb cccc' spans both rows.
      const s = withSelection('aaaa bbbb cccc dddd', 5, 14)
      const layout = buildWrapLayout(s.value, { width: 10 })
      expect(layout.rows.length).toBe(2)
      expect(layout.logicalToVisual(5).row).toBe(0)
      expect(layout.logicalToVisual(14).row).toBe(1)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: 'bbbb cccc' })
    })

    it('char-wrapped: selection across visual rows of a single long token', () => {
      // 18 a's at width 10 wraps to:
      //   row 0: 'aaaaaaaaaa'  (chars 0-10)
      //   row 1: 'aaaaaaaa'    (chars 10-18)
      // Selection [3, 15] crosses row boundary at char 10.
      const s = withSelection('a'.repeat(18), 3, 15)
      const layout = buildWrapLayout(s.value, { width: 10 })
      expect(layout.rows.length).toBe(2)
      expect(layout.logicalToVisual(3).row).toBe(0)
      expect(layout.logicalToVisual(15).row).toBe(1)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: 'a'.repeat(12) })
    })

    it('cuts across visual rows: clipboard receives buffer slice + delete uses same range', () => {
      // 'hello world hello world' (23 chars). Width 12 wraps to:
      //   row 0: 'hello world '  (chars 0-12)
      //   row 1: 'hello world'   (chars 12-23)
      // Cut [6, 17] = 'world hello' spans both rows. Verify the
      // returned text is exactly that — and that a follow-up reduce
      // with deleteBackward removes precisely that range from the
      // buffer (no off-by-one from visual-row mismath).
      const s = withSelection('hello world hello world', 6, 17)
      const layout = buildWrapLayout(s.value, { width: 12 })
      expect(layout.rows.length).toBe(2)
      const cut = clipboardKeyAction(ctrlX, s, false)
      expect(cut).toEqual({ kind: 'cut', text: 'world hello' })

      // The React shell does `copy(text); dispatch(deleteBackward)`.
      // Simulate the dispatch and verify the buffer is what we'd
      // expect: the [6,17) range removed, caret at 6.
      const opts = { multiline: true, maxLength: undefined, width: 12 }
      const after = reduce(s, { type: 'deleteBackward' }, opts)
      expect(after.value).toBe('hello  world')
      expect(after.caret).toBe(6)
      expect(after.selection).toBeNull()
    })

    it('selection spans both a wrap continuation AND a hard \\n boundary', () => {
      // Logical line 0: 'aaaaaa bbbbbb' (13 chars; wraps at width 8 to
      // 'aaaaaa ' + 'bbbbbb'). \n at idx 13. Logical line 1: 'cccc'.
      // Buffer = 'aaaaaa bbbbbb\ncccc' (18 chars).
      // Selection [4, 16] = 'aa bbbbbb\ncc' touches:
      //   row 0 of logical line 0 (the 'aa ')
      //   row 1 of logical line 0 (the 'bbbbbb')
      //   row 2 — logical line 1 (the 'cc')
      // newline preserved verbatim.
      const value = 'aaaaaa bbbbbb\ncccc'
      const s = withSelection(value, 4, 16)
      const layout = buildWrapLayout(value, { width: 8 })
      expect(layout.rows.length).toBeGreaterThanOrEqual(3)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: 'aa bbbbbb\ncc' })
    })

    it('indented-wrap continuation: clipboard text excludes the visual indent decoration', () => {
      // '    apple banana' has 4 leading spaces (chars 0-3). With
      // indentedWrap + width 12, the layout decorates continuation
      // rows with 4 indent cells (rendered as spaces by the renderer,
      // NOT in the buffer). selectedText must NOT pick up that
      // decoration. Selection [6, 16) = 'ple banana' — the 'ple' is
      // in row 0, 'banana' is in the continuation row.
      const value = '    apple banana'
      const s = withSelection(value, 6, 16)
      const layout = buildWrapLayout(value, { width: 12, indentedWrap: true })
      // Sanity: there's at least one continuation row carrying the
      // indent decoration. Without it, the test wouldn't be exercising
      // anything wrap-specific.
      const continuation = layout.rows.find((r) => r.isWrapContinuation)
      expect(continuation?.indentCells).toBeGreaterThan(0)
      // Clipboard text is the raw [6, 16) buffer slice. No injected
      // indent spaces, no row joiners.
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: 'ple banana' })
    })

    it('hint-protected atomic span inside a multi-row selection: text is verbatim buffer', () => {
      // Wrap hints affect WHERE rows break, never WHAT bytes a
      // selection captures. Construct a selection that fully contains
      // a hinted atomic span ('chit-abc-123') plus surrounding text;
      // verify the copied text is the unaltered buffer slice
      // regardless of how the hint shifted the wrap.
      //
      // Buffer: 'see chit-abc-123 for more' (25 chars). At width 14
      // with hint covering 'chit-abc-123' (chars 4-16), the wrap must
      // not break inside the hint — so the natural break shifts.
      const value = 'see chit-abc-123 for more'
      const s = withSelection(value, 0, 20) // 'see chit-abc-123 for'
      const layout = buildWrapLayout(value, {
        width: 14,
        hints: [{ start: 4, end: 16 }],
      })
      // No row should split the hinted span.
      for (const row of layout.rows) {
        const rowEnd = row.endCharIdx
        const hintStart = 4
        const hintEnd = 16
        expect(rowEnd > hintStart && rowEnd < hintEnd).toBe(false)
      }
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({
        kind: 'copy',
        text: 'see chit-abc-123 for',
      })
    })

    it('CJK at row boundary: selection across the boundary returns full graphemes', () => {
      // CJK chars are 2 cells each. '中文测试日本' (6 chars, 12 cells).
      // Width 8 packs 4 chars (8 cells) per row:
      //   row 0: '中文测试' (chars 0-4)
      //   row 1: '日本'     (chars 4-6)
      // Selection [2, 5] = '测试日' crosses row boundary mid-grapheme
      // group. Buffer slice is correct because we slice by char idx,
      // not cell idx.
      const value = '中文测试日本'
      const s = withSelection(value, 2, 5)
      const layout = buildWrapLayout(value, { width: 8 })
      expect(layout.rows.length).toBe(2)
      expect(layout.logicalToVisual(2).row).toBe(0)
      expect(layout.logicalToVisual(5).row).toBe(1)
      expect(clipboardKeyAction(ctrlC, s, false)).toEqual({ kind: 'copy', text: '测试日' })
    })

    it('password mode + multi-row selection: still falls through, text never reaches clipboard', () => {
      // Same architectural rule applies regardless of wrap state:
      // password mode never copies. Visual-row span doesn't change
      // that — the gate is on `password`, not on the selection shape.
      const s = withSelection('a'.repeat(30), 5, 25)
      const layout = buildWrapLayout(s.value, { width: 10 })
      expect(layout.rows.length).toBeGreaterThan(2) // truly spans 3+ rows
      expect(clipboardKeyAction(ctrlC, s, true)).toEqual({ kind: 'fallthrough' })
      expect(clipboardKeyAction(ctrlX, s, true)).toEqual({ kind: 'cut-no-copy' })
    })
  })
})
