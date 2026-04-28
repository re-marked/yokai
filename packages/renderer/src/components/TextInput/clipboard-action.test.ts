/**
 * Tests for the pure clipboard-decision helper. Every cell of the
 * matrix in clipboard-action.ts is covered, plus the no-op cases for
 * keys this helper doesn't claim (Ctrl+V, Ctrl+Shift+C, modifier-less
 * 'c').
 */

import { describe, expect, it } from 'vitest'
import { type ClipboardKeyInput, clipboardKeyAction } from './clipboard-action.js'
import { type TextInputState, initialState, reduce } from './state.js'

const opts = { multiline: false, maxLength: undefined }

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
})
