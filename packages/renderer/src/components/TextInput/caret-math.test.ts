/**
 * Pure-math tests for the TextInput caret helpers. The component
 * combines these into rendering + input handling; everything correctness-
 * critical lives here so a test failure points at one well-named
 * function rather than at a 600-line component.
 */

import { describe, expect, it } from 'vitest'
import {
  cellColumnAt,
  cellWidth,
  charIndexAtCellColumn,
  charIndexAtLineCol,
  lineColAt,
  splitLines,
  wordBoundaryAfter,
  wordBoundaryBefore,
} from './caret-math.js'

// ── cellWidth + cellColumnAt ─────────────────────────────────────────

describe('cellWidth', () => {
  it('counts narrow ASCII as 1 cell each', () => {
    expect(cellWidth('hello')).toBe(5)
  })

  it('counts wide CJK chars as 2 cells each', () => {
    expect(cellWidth('中文')).toBe(4)
  })

  it('counts combining marks as 0 (combine with previous)', () => {
    // 'á' as a + combining acute accent
    expect(cellWidth('á')).toBe(1)
  })

  it('handles mixed narrow + wide + combining', () => {
    expect(cellWidth('a中b́')).toBe(4)
  })

  it('returns 0 for empty string', () => {
    expect(cellWidth('')).toBe(0)
  })
})

describe('cellColumnAt', () => {
  it('returns 0 at index 0', () => {
    expect(cellColumnAt('hello', 0)).toBe(0)
  })

  it('returns total cell width at index = length', () => {
    expect(cellColumnAt('hello', 5)).toBe(5)
  })

  it('clamps negative to 0', () => {
    expect(cellColumnAt('hello', -3)).toBe(0)
  })

  it('clamps over-length to total cell width', () => {
    expect(cellColumnAt('hello', 99)).toBe(5)
  })

  it('counts wide chars as 2 cells', () => {
    // Buffer: '中a' — index 1 sits AFTER 中 → col 2
    expect(cellColumnAt('中a', 1)).toBe(2)
    expect(cellColumnAt('中a', 2)).toBe(3)
  })

  it('counts combining marks as 0', () => {
    // Buffer: 'áb' — index 2 sits AFTER the accent → col 1 (still after 'a')
    expect(cellColumnAt('áb', 2)).toBe(1)
  })
})

describe('charIndexAtCellColumn', () => {
  it('returns 0 at col 0', () => {
    expect(charIndexAtCellColumn('hello', 0)).toBe(0)
  })

  it('inverse of cellColumnAt for narrow ASCII', () => {
    expect(charIndexAtCellColumn('hello', 3)).toBe(3)
  })

  it('clamps over-width to buffer length', () => {
    expect(charIndexAtCellColumn('hello', 99)).toBe(5)
  })

  it('clamps negative to 0', () => {
    expect(charIndexAtCellColumn('hello', -2)).toBe(0)
  })

  it('snaps to LEFT edge of a wide char when click lands mid-glyph', () => {
    // Buffer: '中文' — cells 0-1 are 中, cells 2-3 are 文.
    // Click at cell 1 (right half of 中) → caret snaps before 中 (idx 0).
    expect(charIndexAtCellColumn('中文', 1)).toBe(0)
    // Click at cell 2 (left edge of 文) → caret between (idx 1).
    expect(charIndexAtCellColumn('中文', 2)).toBe(1)
  })

  it('handles combining marks (zero-width) gracefully', () => {
    // 'áb': stringWidth of 'á' = 1, of 'b' = 1.
    // Click at cell 1 → after 'á' → idx 2.
    // For decomposed forms ('a' + combining-accent + 'b'), idx 1 sits
    // visually between the base char and its accent, idx 2 sits after
    // the accent — both render the caret at the same screen cell. The
    // helper picks the LEFT-most valid index; either is acceptable
    // for click positioning. (Arrow-key nav skipping combining marks
    // is a separate concern.)
    const idx = charIndexAtCellColumn('áb', 1)
    expect([1, 2]).toContain(idx)
  })
})

// ── splitLines + line/col conversions ────────────────────────────────

describe('splitLines', () => {
  it('returns single line for buffer without newlines', () => {
    expect(splitLines('hello')).toEqual(['hello'])
  })

  it('splits on \\n', () => {
    expect(splitLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
  })

  it('produces a trailing empty line for trailing \\n', () => {
    // Matters for caret math: caret at end of buffer with trailing \n
    // must be on the empty trailing line, not the previous line.
    expect(splitLines('a\n')).toEqual(['a', ''])
  })

  it('returns [""] for empty buffer', () => {
    expect(splitLines('')).toEqual([''])
  })
})

describe('lineColAt', () => {
  it('line 0, col 0 at start', () => {
    expect(lineColAt('hello\nworld', 0)).toEqual({ line: 0, col: 0 })
  })

  it('line 0, col N for index within first line', () => {
    expect(lineColAt('hello\nworld', 3)).toEqual({ line: 0, col: 3 })
  })

  it('line 1, col 0 at start of second line', () => {
    // Buffer: 'hello\nworld' — index 6 is 'w', the first char of line 1.
    expect(lineColAt('hello\nworld', 6)).toEqual({ line: 1, col: 0 })
  })

  it('clamps negative to (0, 0)', () => {
    expect(lineColAt('hi', -5)).toEqual({ line: 0, col: 0 })
  })

  it('clamps over-length to last position', () => {
    expect(lineColAt('hi', 99)).toEqual({ line: 0, col: 2 })
  })

  it('handles trailing newline (caret on empty trailing line)', () => {
    // 'a\n' — index 2 is on line 1, col 0 (the empty trailing line).
    expect(lineColAt('a\n', 2)).toEqual({ line: 1, col: 0 })
  })
})

describe('charIndexAtLineCol', () => {
  it('inverse of lineColAt for line 0', () => {
    expect(charIndexAtLineCol('hello\nworld', 0, 3)).toBe(3)
  })

  it('inverse for line 1', () => {
    expect(charIndexAtLineCol('hello\nworld', 1, 0)).toBe(6)
  })

  it('clamps over-line to last line', () => {
    expect(charIndexAtLineCol('hello\nworld', 99, 0)).toBe(6)
  })

  it('clamps over-col to line length', () => {
    expect(charIndexAtLineCol('hello\nworld', 0, 99)).toBe(5)
  })
})

// ── word boundaries ──────────────────────────────────────────────────

describe('wordBoundaryBefore', () => {
  it('returns 0 at start', () => {
    expect(wordBoundaryBefore('hello world', 0)).toBe(0)
  })

  it('returns the start of the current word when in middle', () => {
    // 'hello world', idx 8 is in 'world' → start of word is 6.
    expect(wordBoundaryBefore('hello world', 8)).toBe(6)
  })

  it('skips whitespace then jumps to previous word start', () => {
    // 'hello world', idx 6 is at 'w' (no whitespace skip needed).
    // idx 5 is the space; skip back to start of 'hello' = 0.
    expect(wordBoundaryBefore('hello world', 5)).toBe(0)
  })

  it('treats punctuation as non-word (matches readline semantics)', () => {
    // 'foo.bar' — '.' is non-word; idx 4 (start of 'bar') backs to 4.
    expect(wordBoundaryBefore('foo.bar', 6)).toBe(4)
  })

  it('returns from at start when from === 0', () => {
    expect(wordBoundaryBefore('hello', 0)).toBe(0)
  })
})

describe('wordBoundaryAfter', () => {
  it('returns length at end', () => {
    expect(wordBoundaryAfter('hello world', 11)).toBe(11)
  })

  it('jumps to end of current word when in middle', () => {
    expect(wordBoundaryAfter('hello world', 2)).toBe(5)
  })

  it('skips whitespace then jumps to next word end', () => {
    // 'hello world', idx 5 is space; skip to 'w', then to end of 'world'.
    expect(wordBoundaryAfter('hello world', 5)).toBe(11)
  })

  it('treats punctuation as non-word', () => {
    // 'foo.bar', idx 3 is '.'; skip to 'b', end of word is 7.
    expect(wordBoundaryAfter('foo.bar', 3)).toBe(7)
  })
})
