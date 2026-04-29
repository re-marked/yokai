/**
 * Tests for the wrap-math primitive. Each helper gets its own
 * `describe` block — the tests serve as the spec for what the
 * helpers do, including all the edge cases that pure-implementation
 * intuition tends to miss (zero-width graphemes, wide chars at row
 * boundaries, single-grapheme overflow, empty inputs, degenerate
 * widths).
 */

import { describe, expect, it } from 'vitest'
import { wrapByCells } from './wrap-math.js'

describe('wrapByCells', () => {
  describe('basic ASCII', () => {
    it('splits text into rows of exactly `width` cells', () => {
      expect(wrapByCells('abcdefghij', 5)).toEqual(['abcde', 'fghij'])
    })

    it('returns one row when text fits within width', () => {
      expect(wrapByCells('hi', 10)).toEqual(['hi'])
    })

    it('returns one row when text is exactly width', () => {
      expect(wrapByCells('abcde', 5)).toEqual(['abcde'])
    })

    it('handles trailing partial rows', () => {
      expect(wrapByCells('abcdefg', 3)).toEqual(['abc', 'def', 'g'])
    })

    it('width=1 puts each grapheme on its own row', () => {
      expect(wrapByCells('hello', 1)).toEqual(['h', 'e', 'l', 'l', 'o'])
    })
  })

  describe('degenerate inputs', () => {
    it('returns [] for empty input (distinct from [""])', () => {
      // Distinction matters: an empty logical line should produce ONE
      // visual row of zero cells (so the cursor can sit on it). That's
      // the responsibility of buildWrapLayout (A3); wrapByCells just
      // says "nothing to wrap, no rows."
      expect(wrapByCells('', 5)).toEqual([])
    })

    it('returns [] for width=0 (degenerate, no row could ever fit)', () => {
      expect(wrapByCells('hello', 0)).toEqual([])
    })

    it('returns [] for negative width (nonsense input, defensive)', () => {
      expect(wrapByCells('hello', -1)).toEqual([])
    })
  })

  describe('wide characters (CJK, ambiguous-width)', () => {
    it('treats CJK as 2 cells, packs by exact cell count', () => {
      // 中 = 2 cells, 文 = 2 cells, ab = 2 cells. Width 4 → 2 cells per
      // row of CJK or 4 ASCII cells.
      expect(wrapByCells('中文ab', 4)).toEqual(['中文', 'ab'])
    })

    it('breaks before a wide char that would straddle the row boundary', () => {
      // Width 3: 中(2) fits, 文(2) → 2+2=4 > 3, push "中" and start "文"
      // alone. Then a(1) → 2+1=3, b(1) → 3+1=4 > 3, push "文a" and
      // start "b". End: push "b".
      expect(wrapByCells('中文ab', 3)).toEqual(['中', '文a', 'b'])
    })

    it('emits a single grapheme wider than width on its own overflowing row', () => {
      // Width 1 with CJK: 中 (2 cells) doesn't fit anywhere clean. Emit
      // on its own row, accept the overflow. Preserves the data.
      expect(wrapByCells('中', 1)).toEqual(['中'])
    })

    it('handles mixed-width input cleanly', () => {
      // a(1) 中(2) b(1) 文(2) c(1) at width 3:
      //   a → row="a" w=1
      //   中 → 1+2=3, fits exactly, row="a中" w=3
      //   b → 3+1=4 > 3, push "a中", row="b" w=1
      //   文 → 1+2=3, fits, row="b文" w=3
      //   c → 3+1=4 > 3, push "b文", row="c"
      //   end: push "c"
      expect(wrapByCells('a中b文c', 3)).toEqual(['a中', 'b文', 'c'])
    })
  })

  describe('non-BMP graphemes (emoji, surrogate pairs)', () => {
    it('keeps surrogate-pair emoji intact across boundaries', () => {
      // 😀 is U+1F600 (one grapheme, two UTF-16 units, two cells).
      // Width 2: emoji fills the row, then ok goes to next.
      expect(wrapByCells('😀ok', 2)).toEqual(['😀', 'ok'])
    })

    it('respects emoji width in packing decisions', () => {
      // 😀(2) + h(1) = 3 cells. Width 3 fits both on one row;
      // width 2 splits.
      expect(wrapByCells('😀h', 3)).toEqual(['😀h'])
      expect(wrapByCells('😀h', 2)).toEqual(['😀', 'h'])
    })

    it('treats ZWJ-joined family emoji as a single grapheme', () => {
      // 👨‍👩‍👧 — man + ZWJ + woman + ZWJ + girl. Three code points joined
      // into one grapheme. Width is 2 cells (per stringWidth's emoji
      // handling). Should never be split.
      const family = '👨‍👩‍👧'
      expect(wrapByCells(family, 5)).toEqual([family])
      // Even at width 2 (exact fit) it stays whole.
      expect(wrapByCells(family, 2)).toEqual([family])
    })
  })

  describe('combining marks (zero-width)', () => {
    it('attaches a combining mark to its base grapheme without advancing cells', () => {
      // 'á' as a precomposed grapheme (U+00E1) is one code point, one
      // cell. Intl.Segmenter groups it as one grapheme cluster regardless
      // of decomposition; wrap should treat it atomically.
      expect(wrapByCells('ábc', 2)).toEqual(['áb', 'c'])
    })

    it('decomposed combining marks travel with their base', () => {
      // 'a' + U+0301 (combining acute) is two code points but one
      // grapheme cluster. Intl.Segmenter groups them; wrap should
      // treat the pair atomically. Construct explicitly via codepoint
      // so the test is bit-identical regardless of editor normalization.
      const ACUTE = String.fromCodePoint(0x0301)
      const decomposed = `a${ACUTE}bc`
      expect(wrapByCells(decomposed, 2)).toEqual([`a${ACUTE}b`, 'c'])
    })
  })

  describe('exact-fit scenarios', () => {
    it('does not emit an extra empty row when text ends exactly at width', () => {
      // Common edge case: a row that fills exactly. Should be ONE row
      // ['abc'], not ['abc', ''].
      expect(wrapByCells('abc', 3)).toEqual(['abc'])
    })

    it('does not emit an empty row at end when last grapheme fits exactly', () => {
      expect(wrapByCells('abcdef', 3)).toEqual(['abc', 'def'])
    })
  })
})
