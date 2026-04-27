/**
 * TextInput state-machine tests.
 *
 * Drives `reduce()` with every action in isolation. The React component
 * just translates user input into Action objects and feeds them to the
 * reducer; these tests cover the behavioural contract without React.
 */

import { describe, expect, it } from 'vitest'
import {
  type Action,
  type ReducerOptions,
  initialState,
  reduce,
  selectedText,
} from './state.js'

const SINGLE: ReducerOptions = { multiline: false, maxLength: undefined }
const MULTI: ReducerOptions = { multiline: true, maxLength: undefined }

function init(value = '') {
  return initialState(value)
}

function apply(value: string, ...actions: Action[]) {
  let s = init(value)
  for (const a of actions) s = reduce(s, a, MULTI)
  return s
}

// ── insertText ───────────────────────────────────────────────────────

describe('reduce: insertText', () => {
  it('appends at caret for empty buffer', () => {
    const s = reduce(init(''), { type: 'insertText', text: 'hi' }, SINGLE)
    expect(s.value).toBe('hi')
    expect(s.caret).toBe(2)
  })

  it('inserts in the middle when caret is in the middle', () => {
    let s = init('helloworld')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, SINGLE)
    s = reduce(s, { type: 'insertText', text: ' ' }, SINGLE)
    expect(s.value).toBe('hello world')
    expect(s.caret).toBe(6)
  })

  it('replaces a non-empty selection', () => {
    let s = init('hello world')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, SINGLE)
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: true }, SINGLE)
    s = reduce(s, { type: 'insertText', text: 'HEY' }, SINGLE)
    expect(s.value).toBe('HEY world')
    expect(s.caret).toBe(3)
    expect(s.selection).toBeNull()
  })

  it('strips newlines in single-line mode', () => {
    const s = reduce(init(''), { type: 'insertText', text: 'a\nb\rc' }, SINGLE)
    expect(s.value).toBe('a b c')
  })

  it('preserves newlines in multiline mode', () => {
    const s = reduce(init(''), { type: 'insertText', text: 'a\nb' }, MULTI)
    expect(s.value).toBe('a\nb')
  })

  it('truncates to maxLength', () => {
    const opts = { ...SINGLE, maxLength: 5 }
    // Buffer 'abc' (caret at end = 3), insert 'XYZAB' with max=5.
    // Existing chars stay; the insertion truncates to fit the
    // remaining 2 cells → 'abc' + 'XY' = 'abcXY'.
    const s = reduce(init('abc'), { type: 'insertText', text: 'XYZAB' }, opts)
    expect(s.value).toBe('abcXY')
    expect(s.value.length).toBe(5)
  })

  it('with maxLength and selection replacement, accounts for the selected length', () => {
    // Buffer 'hello' (5), select 'ell' (3), insert 'WORLD' (5) with max=5.
    // After replacement: value length budget = 5 - (5 - 3) = 3, so insert is 'WOR'.
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 1, extend: false }, SINGLE)
    s = reduce(s, { type: 'setCaret', charIdx: 4, extend: true }, SINGLE)
    s = reduce(s, { type: 'insertText', text: 'WORLD' }, { ...SINGLE, maxLength: 5 })
    expect(s.value).toBe('hWORo')
  })
})

// ── delete actions ───────────────────────────────────────────────────

describe('reduce: deleteBackward', () => {
  it('removes char before caret', () => {
    const s = apply('hello', { type: 'deleteBackward' })
    expect(s.value).toBe('hell')
    expect(s.caret).toBe(4)
  })

  it('no-op at start of buffer', () => {
    const s = apply('', { type: 'deleteBackward' })
    expect(s.value).toBe('')
    expect(s.caret).toBe(0)
  })

  it('removes selection when one exists', () => {
    let s = init('hello world')
    s = reduce(s, { type: 'setCaret', charIdx: 6, extend: false }, MULTI)
    s = reduce(s, { type: 'setCaret', charIdx: 11, extend: true }, MULTI)
    s = reduce(s, { type: 'deleteBackward' }, MULTI)
    expect(s.value).toBe('hello ')
    expect(s.selection).toBeNull()
  })
})

describe('reduce: deleteForward', () => {
  it('removes char after caret', () => {
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    s = reduce(s, { type: 'deleteForward' }, MULTI)
    expect(s.value).toBe('ello')
    expect(s.caret).toBe(0)
  })

  it('no-op at end of buffer', () => {
    const s = apply('hi', { type: 'deleteForward' })
    expect(s.value).toBe('hi')
  })
})

describe('reduce: deleteWordBackward', () => {
  it('removes word before caret', () => {
    const s = apply('hello world', { type: 'deleteWordBackward' })
    expect(s.value).toBe('hello ')
  })

  it('removes spaces back to previous word boundary', () => {
    let s = init('hello world  ')
    s = reduce(s, { type: 'deleteWordBackward' }, MULTI)
    // 13 chars; caret at 13. wordBoundaryBefore: skip 2 spaces, then 'world' → 6.
    expect(s.value).toBe('hello ')
  })

  it('no-op at start', () => {
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    s = reduce(s, { type: 'deleteWordBackward' }, MULTI)
    expect(s.value).toBe('hello')
  })
})

describe('reduce: deleteLineBackward (Ctrl+U)', () => {
  it('removes from caret to start of current line', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 9, extend: false }, MULTI) // mid 'world'
    s = reduce(s, { type: 'deleteLineBackward' }, MULTI)
    expect(s.value).toBe('hello\nld')
    expect(s.caret).toBe(6)
  })

  it('no-op when caret at line start', () => {
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    s = reduce(s, { type: 'deleteLineBackward' }, MULTI)
    expect(s.value).toBe('hello')
  })
})

describe('reduce: deleteLineForward (Ctrl+K)', () => {
  it('removes from caret to end of current line', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 2, extend: false }, MULTI)
    s = reduce(s, { type: 'deleteLineForward' }, MULTI)
    expect(s.value).toBe('he\nworld')
    expect(s.caret).toBe(2)
  })

  it('no-op at end of line', () => {
    let s = init('hello')
    s = reduce(s, { type: 'deleteLineForward' }, MULTI)
    expect(s.value).toBe('hello')
  })
})

// ── caret movement ───────────────────────────────────────────────────

describe('reduce: moveCaret', () => {
  it('left at start clamps to 0', () => {
    let s = init('hi')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'left', extend: false }, MULTI)
    expect(s.caret).toBe(0)
  })

  it('right at end clamps to length', () => {
    let s = init('hi')
    s = reduce(s, { type: 'moveCaret', direction: 'right', extend: false }, MULTI)
    expect(s.caret).toBe(2)
  })

  it('up across lines preserves col', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 9, extend: false }, MULTI) // 'r' in world; col 3
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, MULTI)
    // line 0, col 3 → idx 3 (the 'l' in 'hello')
    expect(s.caret).toBe(3)
  })

  it('down across lines preserves col', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 2, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    // line 1, col 2 → 'r' = idx 8
    expect(s.caret).toBe(8)
  })

  it('up at first line goes to start', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 3, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, MULTI)
    expect(s.caret).toBe(0)
  })

  it('down at last line goes to end', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 8, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.caret).toBe(11)
  })

  it('home goes to start of current line', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 9, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'home', extend: false }, MULTI)
    expect(s.caret).toBe(6)
  })

  it('end goes to end of current line', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 7, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'end', extend: false }, MULTI)
    expect(s.caret).toBe(11)
  })

  it('wordLeft jumps to start of current word', () => {
    let s = init('hello world')
    s = reduce(s, { type: 'setCaret', charIdx: 8, extend: false }, MULTI) // mid 'world'
    s = reduce(s, { type: 'moveCaret', direction: 'wordLeft', extend: false }, MULTI)
    expect(s.caret).toBe(6)
  })

  it('wordRight jumps to end of current word', () => {
    let s = init('hello world')
    s = reduce(s, { type: 'setCaret', charIdx: 2, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'wordRight', extend: false }, MULTI)
    expect(s.caret).toBe(5)
  })

  it('docStart and docEnd', () => {
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'docStart', extend: false }, MULTI)
    expect(s.caret).toBe(0)
    s = reduce(s, { type: 'moveCaret', direction: 'docEnd', extend: false }, MULTI)
    expect(s.caret).toBe(11)
  })
})

describe('reduce: moveCaret with extend (selection)', () => {
  it('starts a selection from current caret', () => {
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 2, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'right', extend: true }, MULTI)
    expect(s.caret).toBe(3)
    expect(s.selection).toEqual({ anchor: 2, focus: 3 })
  })

  it('extends an existing selection', () => {
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'right', extend: true }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'right', extend: true }, MULTI)
    expect(s.selection).toEqual({ anchor: 0, focus: 2 })
  })

  it('moveCaret without extend clears selection', () => {
    let s = init('hello')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'right', extend: true }, MULTI)
    expect(s.selection).not.toBeNull()
    s = reduce(s, { type: 'moveCaret', direction: 'right', extend: false }, MULTI)
    expect(s.selection).toBeNull()
  })
})

// ── selectAll + selectedText ────────────────────────────────────────

describe('reduce: selectAll', () => {
  it('selects the entire buffer', () => {
    const s = reduce(init('hello'), { type: 'selectAll' }, MULTI)
    expect(s.selection).toEqual({ anchor: 0, focus: 5 })
    expect(selectedText(s)).toBe('hello')
  })
})

// ── undo / redo ──────────────────────────────────────────────────────

describe('reduce: undo / redo', () => {
  it('undo reverts the last edit', () => {
    let s = init('a')
    s = reduce(s, { type: 'insertText', text: 'b' }, MULTI)
    expect(s.value).toBe('ab')
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('a')
  })

  it('redo re-applies', () => {
    let s = init('a')
    s = reduce(s, { type: 'insertText', text: 'b' }, MULTI)
    s = reduce(s, { type: 'undo' }, MULTI)
    s = reduce(s, { type: 'redo' }, MULTI)
    expect(s.value).toBe('ab')
  })

  it('undo at start of history is a no-op', () => {
    const s = reduce(init('hi'), { type: 'undo' }, MULTI)
    expect(s.value).toBe('hi')
  })

  it('redo at end of history is a no-op', () => {
    const s = reduce(init('hi'), { type: 'redo' }, MULTI)
    expect(s.value).toBe('hi')
  })

  it('typing after undo discards the redo branch', () => {
    let s = init('a')
    s = reduce(s, { type: 'insertText', text: 'b' }, MULTI)
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('a')
    s = reduce(s, { type: 'insertText', text: 'c' }, MULTI)
    expect(s.value).toBe('ac')
    // redo should now be impossible.
    const r = reduce(s, { type: 'redo' }, MULTI)
    expect(r).toEqual(s)
  })

  it('consecutive insert keystrokes merge into one undo step', () => {
    let s = init('')
    s = reduce(s, { type: 'insertText', text: 'h' }, MULTI)
    s = reduce(s, { type: 'insertText', text: 'e' }, MULTI)
    s = reduce(s, { type: 'insertText', text: 'l' }, MULTI)
    expect(s.value).toBe('hel')
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('') // one undo reverts the whole typed run
  })

  it('consecutive deletes merge into one undo step', () => {
    let s = init('hello')
    s = reduce(s, { type: 'deleteBackward' }, MULTI)
    s = reduce(s, { type: 'deleteBackward' }, MULTI)
    expect(s.value).toBe('hel')
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('hello') // one undo reverts both deletes
  })

  it('paste does NOT merge with adjacent inserts', () => {
    let s = init('')
    s = reduce(s, { type: 'insertText', text: 'a' }, MULTI)
    s = reduce(s, { type: 'insertText', text: 'PASTED', isPaste: true }, MULTI)
    s = reduce(s, { type: 'insertText', text: 'z' }, MULTI)
    expect(s.value).toBe('aPASTEDz')
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('aPASTED') // the trailing 'z' insert is its own step
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('a') // paste is its own step
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.value).toBe('')
  })

  it('history caps at the configured size', () => {
    const opts = { ...MULTI, historyCap: 5 }
    let s = init('')
    // 5 separate paste entries (paste doesn't merge).
    for (let i = 0; i < 10; i++) {
      s = reduce(s, { type: 'insertText', text: `${i}`, isPaste: true }, opts)
    }
    expect(s.history.length).toBe(5)
    expect(s.historyIndex).toBe(4)
  })
})
