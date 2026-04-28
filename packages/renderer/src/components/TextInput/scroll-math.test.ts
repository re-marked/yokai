/**
 * Pure-math tests for the TextInput scroll helpers.
 */

import { describe, expect, it } from 'vitest'
import { scrollToKeepCaretVisible, sliceRowByCells } from './scroll-math.js'

describe('scrollToKeepCaretVisible', () => {
  it('no scroll when caret is in view', () => {
    const next = scrollToKeepCaretVisible({
      scroll: 0,
      caretPos: 5,
      windowSize: 20,
      contentSize: 30,
    })
    expect(next).toBe(0)
  })

  it('scrolls left when caret is before the window', () => {
    const next = scrollToKeepCaretVisible({
      scroll: 10,
      caretPos: 3,
      windowSize: 20,
      contentSize: 30,
    })
    expect(next).toBe(3)
  })

  it('scrolls right when caret is past the window', () => {
    // Window of 10 starting at 0; caret at 15 → need to shift right
    // so caret sits at the trailing edge (cell `windowSize-1`).
    const next = scrollToKeepCaretVisible({
      scroll: 0,
      caretPos: 15,
      windowSize: 10,
      contentSize: 30,
    })
    expect(next).toBe(6) // 15 - 10 + 1
  })

  it('treats caret at scroll + windowSize as off-screen (1-cell trailing pad)', () => {
    // caret AT the boundary (right edge) is invisible — it would
    // render past the last cell. Predicate uses >= so we shift.
    const next = scrollToKeepCaretVisible({
      scroll: 0,
      caretPos: 10,
      windowSize: 10,
      contentSize: 30,
    })
    expect(next).toBe(1)
  })

  it('clamps to content end (no over-scroll past last cell)', () => {
    const next = scrollToKeepCaretVisible({
      scroll: 100,
      caretPos: 28,
      windowSize: 10,
      contentSize: 30,
    })
    // Caret-into-view brings scroll back to 28 (caret at leading
    // edge); clamp to max contentSize - windowSize = 20. Resulting
    // window [20, 30) still contains caret 28, so this is correct.
    expect(next).toBe(20)
  })

  it('clamps to 0 (no negative scroll)', () => {
    const next = scrollToKeepCaretVisible({
      scroll: -5,
      caretPos: 0,
      windowSize: 10,
      contentSize: 30,
    })
    expect(next).toBe(0)
  })

  it('returns 0 for windowSize 0 (degenerate, avoids divide-by-zero downstream)', () => {
    const next = scrollToKeepCaretVisible({
      scroll: 5,
      caretPos: 10,
      windowSize: 0,
      contentSize: 30,
    })
    expect(next).toBe(0)
  })

  it('content shorter than window → scroll always 0', () => {
    const next = scrollToKeepCaretVisible({
      scroll: 5, // somehow stale
      caretPos: 3,
      windowSize: 20,
      contentSize: 5,
    })
    expect(next).toBe(0)
  })
})

describe('sliceRowByCells', () => {
  it('slices ASCII by cell count', () => {
    expect(sliceRowByCells('abcdefghij', 0, 5)).toBe('abcde')
    expect(sliceRowByCells('abcdefghij', 3, 4)).toBe('defg')
  })

  it('returns empty for windowSize 0', () => {
    expect(sliceRowByCells('hello', 0, 0)).toBe('')
  })

  it('returns empty when fromCol exceeds content', () => {
    expect(sliceRowByCells('hello', 100, 5)).toBe('')
  })

  it('returns prefix when fromCol negative', () => {
    expect(sliceRowByCells('hello', -3, 3)).toBe('hel')
  })

  it('preserves wide CJK chars within the window', () => {
    // '中文ab' = 2+2+1+1 = 6 cells. Slice cells 0..4 → '中文'
    expect(sliceRowByCells('中文ab', 0, 4)).toBe('中文')
  })

  it('renders a space when a wide char straddles the leading edge', () => {
    // '中文ab', slice cells 1..5 → leading half of 中 is clipped;
    // emit space + '文ab' = ' 文ab' (5 cells).
    expect(sliceRowByCells('中文ab', 1, 5)).toBe(' 文ab')
  })

  it('renders a space when a wide char straddles the trailing edge', () => {
    // '中文ab', slice cells 0..3 → '中' fits, '文' doesn't (would need
    // cells 2-3, but only cell 2 fits) → emit '中 '.
    expect(sliceRowByCells('中文ab', 0, 3)).toBe('中 ')
  })

  it('preserves combining marks attached to visible base chars', () => {
    // 'ábc' → 'á' (1 cell) + 'b' + 'c'.
    // Slice cells 0..2 → 'áb'.
    expect(sliceRowByCells('ábc', 0, 2)).toBe('áb')
  })

  it('handles empty row gracefully', () => {
    expect(sliceRowByCells('', 0, 10)).toBe('')
  })

  it('keeps non-BMP emoji intact (no surrogate-pair split)', () => {
    // '😀' is U+1F600 (one code point, two UTF-16 units). With the
    // old row[i] walk, scrolling into the middle of the emoji's cell
    // pair would emit lone surrogates and produce replacement glyphs.
    // With code-point iteration the emoji always rendered or fully
    // skipped.
    expect(sliceRowByCells('a😀b', 0, 5)).toBe('a😀b')
    // Skip the leading 'a' (1 cell). Emoji starts at cell 1, width 2.
    expect(sliceRowByCells('a😀b', 1, 5)).toBe('😀b')
  })

  it('renders space when an emoji straddles the leading edge', () => {
    // 'a😀b': 'a' (1 cell) + '😀' (2 cells) + 'b' (1 cell). Slice
    // [2, 6) would land mid-emoji on cell 2 — emit a space placeholder
    // for the clipped half so layout doesn't drift, then resume with 'b'.
    expect(sliceRowByCells('a😀b', 2, 4)).toBe(' b')
  })

  it('renders spaces when an emoji straddles the trailing edge', () => {
    // 'ab😀': cells 0,1 are 'a','b'; emoji starts at cell 2 (width 2).
    // Slice [0, 3) fits 'ab' but only one cell of the emoji — emit a
    // space placeholder rather than a half-emoji.
    expect(sliceRowByCells('ab😀', 0, 3)).toBe('ab ')
  })
})
