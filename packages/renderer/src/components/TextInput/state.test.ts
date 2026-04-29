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
  type TextInputState,
  initialState,
  reduce,
  selectedText,
} from './state.js'

// Width is required by ReducerOptions because visual-row navigation
// (`up` / `down` post-C4) needs to know where lines wrap. The value
// here doesn't matter for tests that only exercise non-nav actions —
// 80 is a reasonable terminal-ish default.
const SINGLE: ReducerOptions = { multiline: false, maxLength: undefined, width: 80 }
const MULTI: ReducerOptions = { multiline: true, maxLength: undefined, width: 80 }

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

// ── visual-row nav (up / down with preferredCol) ─────────────────────

describe('reduce: visual-row nav (up / down)', () => {
  // Width 10 — narrow enough to wrap test buffers onto multiple visual
  // rows. wrapByCells fallback is exercised because the test bufer is
  // a single token (no whitespace breaks).
  const WIDE: ReducerOptions = { multiline: true, maxLength: undefined, width: 10 }

  it('Down within a wrapped logical line walks visual rows', () => {
    // 'aaaaaaaaaaaaaa' (14 chars). Width 10 wraps to two char-mode rows:
    // 'aaaaaaaaaa' (10) + 'aaaa' (4). From row 0 col 5, Down lands on
    // row 1 which only has 4 cells — caret clamps to row 1's end
    // (idx 14, also the buffer end).
    let s = init('aaaaaaaaaaaaaa')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, WIDE)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, WIDE)
    expect(s.caret).toBe(14)
    expect(s.preferredCol).toBe(5) // captured on this Down for the next vertical step
  })

  it('Up within a wrapped logical line walks visual rows', () => {
    // Same buffer; caret in row 1 (continuation), press Up.
    let s = init('aaaaaaaaaaaaaa')
    s = reduce(s, { type: 'setCaret', charIdx: 12, extend: false }, WIDE)
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, WIDE)
    // Row 1 col 2 → row 0 col 2 → idx 2.
    expect(s.caret).toBe(2)
    expect(s.preferredCol).toBe(2)
  })

  it('preferredCol persists across short intermediate visual rows', () => {
    // Three rows of varying width — col 5 fits row 0 + row 2 but not
    // the 2-cell row 1. After Down, caret clamps on row 1 to end-of-row;
    // the next Down restores col 5 on row 2 because preferredCol stuck.
    // Width 80 here — no wrap, just multiple logical lines, so visual
    // rows == logical lines and the test isolates the preferredCol
    // mechanism without dragging in wrap-math edge cases.
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.caret).toBe(10) // end of 'bb' (clamped)
    expect(s.preferredCol).toBe(5)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.caret).toBe(16) // 'cccccc' position 5 → idx 11 + 5
    expect(s.preferredCol).toBe(5)
  })

  it('preferredCol resets after a horizontal move', () => {
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.preferredCol).toBe(5)
    s = reduce(s, { type: 'moveCaret', direction: 'left', extend: false }, MULTI)
    expect(s.preferredCol).toBeNull()
  })

  it('preferredCol resets after typing', () => {
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.preferredCol).toBe(5)
    s = reduce(s, { type: 'insertText', text: 'X' }, MULTI)
    expect(s.preferredCol).toBeNull()
  })

  it('preferredCol resets after undo', () => {
    // undo restores buffer / caret / selection but NOT preferredCol —
    // the outer wrapper treats undo as a non-vertical action and clears
    // preferredCol. (preferredCol is UI ephemeral, not editing state.)
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'insertText', text: 'X' }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.preferredCol).not.toBeNull()
    s = reduce(s, { type: 'undo' }, MULTI)
    expect(s.preferredCol).toBeNull()
  })

  it('Up at the first visual row clamps to buffer start', () => {
    let s = init('aaaaaaaaaaaaaa') // wraps to two rows at width 10
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, WIDE)
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, WIDE)
    expect(s.caret).toBe(0)
  })

  it('Down at the last visual row clamps to buffer end', () => {
    let s = init('aaaaaaaaaaaaaa') // wraps to two rows at width 10
    s = reduce(s, { type: 'setCaret', charIdx: 12, extend: false }, WIDE)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, WIDE)
    expect(s.caret).toBe(14)
  })

  it('width=0 falls back to logical-line nav', () => {
    // First-frame edge: yoga hasn't measured yet, layout would be
    // empty. Up / Down still need to advance the caret — fall back to
    // the pre-soft-wrap logical-line nav for that one frame.
    const ZERO: ReducerOptions = { multiline: true, maxLength: undefined, width: 0 }
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 9, extend: false }, ZERO)
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, ZERO)
    expect(s.caret).toBe(3)
    expect(s.preferredCol).toBeNull() // no real layout means no preferred col captured
  })

  it('Shift+Down extends selection AND preserves preferredCol', () => {
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: true }, MULTI)
    expect(s.selection).toEqual({ anchor: 5, focus: 10 })
    expect(s.preferredCol).toBe(5)
  })

  it('logical Down (multi-line, no wrap) still preserves col like before', () => {
    // Regression check: existing 'down across lines preserves col' test
    // already covers this implicitly, but assert preferredCol is also
    // set so future refactors don't accidentally drop it.
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 2, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.caret).toBe(8)
    expect(s.preferredCol).toBe(2)
  })
})

// ── visual-row nav: preferredCol regression coverage ─────────────────

describe('reduce: preferredCol resets across non-vertical actions', () => {
  // Catches "I added a new action and forgot to clear preferredCol"
  // regressions. Each test seeds a state where preferredCol is non-null
  // (set by a prior Down), dispatches the action under test, and
  // asserts preferredCol returned to null. The outer `reduce` wrapper
  // is the single source of truth here — every action EXCEPT vertical
  // move-caret should land on the reset path.

  function withPreferredCol(): TextInputState {
    // Standard fixture: 3 wide logical lines, caret at row 0 col 5,
    // then Down — preferredCol captured as 5. Wide enough that EVERY
    // delete variant has something to delete (Ctrl+K and Ctrl+U
    // would no-op at line ends, and the outer `reduce` wrapper
    // preserves preferredCol on no-ops by referential identity for
    // React memoization — so a fixture parked at line-end would
    // produce false negatives on those branches).
    let s = init('aaaaaaaaaa\nbbbbbbbbbb\ncccccccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.preferredCol).toBe(5)
    expect(s.caret).toBe(16) // line 1 'bbbbbbbbbb' col 5
    return s
  }

  // Every horizontal / jump caret direction. Table-driven so adding a
  // new direction without clearing preferredCol gets caught here.
  const horizontalDirections = [
    'left',
    'right',
    'home',
    'end',
    'wordLeft',
    'wordRight',
    'docStart',
    'docEnd',
  ] as const

  for (const direction of horizontalDirections) {
    it(`resets after moveCaret(${direction})`, () => {
      let s = withPreferredCol()
      s = reduce(s, { type: 'moveCaret', direction, extend: false }, MULTI)
      expect(s.preferredCol).toBeNull()
    })
  }

  // Every delete variant.
  const deleteActions: Action[] = [
    { type: 'deleteBackward' },
    { type: 'deleteForward' },
    { type: 'deleteWordBackward' },
    { type: 'deleteLineBackward' },
    { type: 'deleteLineForward' },
  ]

  for (const action of deleteActions) {
    it(`resets after ${action.type}`, () => {
      let s = withPreferredCol()
      s = reduce(s, action, MULTI)
      expect(s.preferredCol).toBeNull()
    })
  }

  it('resets after setCaret (click / programmatic positioning)', () => {
    let s = withPreferredCol()
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    expect(s.preferredCol).toBeNull()
  })

  it('resets after selectAll', () => {
    let s = withPreferredCol()
    s = reduce(s, { type: 'selectAll' }, MULTI)
    expect(s.preferredCol).toBeNull()
  })

  it('resets after redo (symmetric to undo)', () => {
    // Build a state where redo is meaningful: edit, undo, then enter
    // a vertical chain, then redo. preferredCol should clear.
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, MULTI)
    s = reduce(s, { type: 'insertText', text: 'X' }, MULTI)
    s = reduce(s, { type: 'undo' }, MULTI)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, MULTI)
    expect(s.preferredCol).not.toBeNull()
    s = reduce(s, { type: 'redo' }, MULTI)
    expect(s.preferredCol).toBeNull()
  })
})

describe('reduce: preferredCol persistence across mixed-row layouts', () => {
  // Width 10 wraps long lines; multi-line content layered on top
  // exercises the interaction between visual-row nav and \n boundaries.
  const W10: ReducerOptions = { multiline: true, maxLength: undefined, width: 10 }

  it('Up through a SHORT intermediate visual row preserves preferredCol (mirror of Down test)', () => {
    // 3 logical lines of decreasing width: 'aaaaaaa' (7) / 'bb' (2) /
    // 'cccccc' (6). Width 80 keeps each as one visual row. Start
    // caret at row 2 col 5, press Up twice — clamps on row 1, then
    // returns to col 5 on row 0 because preferredCol stuck.
    let s = init('aaaaaaa\nbb\ncccccc')
    s = reduce(s, { type: 'setCaret', charIdx: 16, extend: false }, MULTI) // col 5 of 'cccccc'
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, MULTI)
    expect(s.caret).toBe(10) // end of 'bb'
    expect(s.preferredCol).toBe(5)
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, MULTI)
    expect(s.caret).toBe(5) // 'aaaaaaa' col 5
    expect(s.preferredCol).toBe(5)
  })

  it('preferredCol persists across a hard \\n boundary mid-vertical-chain', () => {
    // Logical line 0 wraps to 2 visual rows, logical line 1 is one
    // row. Chain Down across the wrap continuation AND the \n; the
    // captured col carries through both transitions.
    //
    //   buffer: 'aaaaaaaaaaaaa\nbbbbbbbbbb' (24 chars)
    //   width 10:
    //     row 0: 'aaaaaaaaaa' (idx 0-10)   ← logical line 0, first visual row
    //     row 1: 'aaa'        (idx 10-13)  ← logical line 0, continuation
    //     row 2: 'bbbbbbbbbb' (idx 14-24)  ← logical line 1
    //
    // Start at row 0 col 5 (idx 5). Down once → row 1 col 3 (clamped,
    // row 1 is only 3 cells); preferredCol still 5. Down again → row 2
    // col 5 (idx 19), back to preferred col after crossing \n.
    let s = init('aaaaaaaaaaaaa\nbbbbbbbbbb')
    s = reduce(s, { type: 'setCaret', charIdx: 5, extend: false }, W10)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, W10)
    expect(s.caret).toBe(13) // end of row 1 (clamped)
    expect(s.preferredCol).toBe(5)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, W10)
    expect(s.caret).toBe(19) // 'bbbbbbbbbb' col 5
    expect(s.preferredCol).toBe(5)
  })

  it('indentedWrap=true: preferredCol captured from DISPLAY col (not text-internal col)', () => {
    // '    apple banana' (16 chars, 4 leading spaces). Width 12 with
    // indentedWrap → row 0 'apple' starts at display col 4 (first row
    // includes the indent in its text), continuation 'banana' has 4
    // indent decoration cells + 'banana'. Caret at idx 6 (the second
    // 'p' in 'apple') — display col 6. Press Down → preferredCol 6.
    const opts: ReducerOptions = {
      ...W10,
      width: 12,
      indentedWrap: true,
    }
    let s = init('    apple banana')
    s = reduce(s, { type: 'setCaret', charIdx: 6, extend: false }, opts)
    s = reduce(s, { type: 'moveCaret', direction: 'down', extend: false }, opts)
    // preferredCol is the DISPLAY col (4 indent + 2 content = 6 on
    // row 0), captured before the move. Continuation row 1 has 4
    // indent decoration; visualToLogical at display col 6 = text col 2
    // within 'banana' = idx 12.
    expect(s.preferredCol).toBe(6)
    expect(s.caret).toBe(12)
  })

  it('vertical move that lands at the same caret (no-op edge) leaves a captured preferredCol set', () => {
    // Caret at row 0 col 0 (idx 0). Up at row 0 returns to start of
    // buffer (caret 0) — no actual movement. The reducer still treats
    // this as a vertical action and captures the visual col (0).
    // Verify the no-movement case doesn't accidentally null the col.
    let s = init('hello\nworld')
    s = reduce(s, { type: 'setCaret', charIdx: 0, extend: false }, MULTI)
    expect(s.preferredCol).toBeNull()
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, MULTI)
    expect(s.caret).toBe(0)
    expect(s.preferredCol).toBe(0)
    // A SECOND Up still respects the captured col (which is 0 here).
    s = reduce(s, { type: 'moveCaret', direction: 'up', extend: false }, MULTI)
    expect(s.caret).toBe(0)
    expect(s.preferredCol).toBe(0)
  })
})
