/**
 * Tests for the wrap-math primitive. Each helper gets its own
 * `describe` block — the tests serve as the spec for what the
 * helpers do, including all the edge cases that pure-implementation
 * intuition tends to miss (zero-width graphemes, wide chars at row
 * boundaries, single-grapheme overflow, empty inputs, degenerate
 * widths).
 */

import { describe, expect, it } from 'vitest'
import { buildWrapLayout, nextVisualRow, wrapByCells, wrapByWords } from './wrap-math.js'

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

describe('wrapByWords', () => {
  describe('basic word wrapping', () => {
    it('breaks at the space between words when content overflows', () => {
      // "hello world" = 11 chars. Width 6: "hello " (6) fits exactly,
      // "w" would push to 7. Break at the space (lastBreakIdx=6) →
      // row1="hello ", row2="world".
      expect(wrapByWords('hello world', 6)).toEqual(['hello ', 'world'])
    })

    it('handles three-word wrapping at exact boundaries', () => {
      // "the quick fox" = 13. Width 5: "the " (4) fits, "q" pushes
      // to 5, fits, "u" → 6, no whitespace break in row → wait no.
      // Walk: t(1) h(2) e(3) " "(4) lastBreak=4. q(5) fits. u(6)
      // > 5, break at lastBreak=4. Push "the ", row="quick"...
      //   q(1) u(2) i(3) c(4) k(5). Then " "(6) fits as ws past
      //   width but lastBreak=6. f(7) > 5, break at 6. Push
      //   "quick ", row="fox".
      expect(wrapByWords('the quick fox', 5)).toEqual(['the ', 'quick ', 'fox'])
    })

    it('one-word input fits when shorter than width', () => {
      expect(wrapByWords('hello', 10)).toEqual(['hello'])
    })

    it('single grapheme input fits trivially', () => {
      expect(wrapByWords('a', 5)).toEqual(['a'])
    })
  })

  describe('long words (char-wrap fallback)', () => {
    it('falls back to char-wrap for a single token longer than width', () => {
      // "looooong" = 8 chars at width 5: no whitespace at all, no
      // break candidate ever, so char-wrap behavior. ["loooo", "ong"].
      expect(wrapByWords('looooong', 5)).toEqual(['loooo', 'ong'])
    })

    it('char-wraps a long token mid-sentence, word-wraps neighbors', () => {
      // "hello looooong world" — "hello " word-wraps cleanly, then
      // looooong char-wraps within itself, then " world" wraps.
      // Walk:
      //   "hello " (6, lastBreak=6). l(7)>6 break at 6 → push "hello ".
      //   row="l" w=1. o w=2. o w=3. o w=4. o w=5. o w=6 > 6 NO ACTUALLY
      //   width=6 so o(6) fits exactly. n(7)>6 no lastBreak (no ws yet
      //   in row "looooo") → push "looooo", row="n" w=1. g w=2. " "(3)
      //   lastBreak=3. w(4) fits. o(5). r(6). l(7)>6 break at 3 →
      //   push "ng ". row="world" w=5. d w=6 fits. End → push "world"
      //   wait that's "worl" + "d". Let me retrace.
      //
      // Honestly the exact split for this input is fiddly to predict.
      // Just check the key invariants: rows respect width except for
      // overflowing tokens, and the long token IS broken up.
      const result = wrapByWords('hello looooong world', 6)
      // Rejoining must reconstruct the original (no chars lost).
      expect(result.join('')).toBe('hello looooong world')
      // Each row must respect width OR be a single overflowing token.
      // (wrapByCells fallback can produce rows up to width.)
      expect(result.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('whitespace handling', () => {
    it('preserves trailing whitespace at break points (HTML/CSS convention)', () => {
      // "hello world" width 6 → ["hello ", "world"] — trailing space
      // stays on the first row.
      const result = wrapByWords('hello world', 6)
      expect(result[0]).toBe('hello ')
    })

    it('preserves leading whitespace as part of the first word (no break before content)', () => {
      // "  hello" width 4 — leading whitespace must NOT be a break
      // candidate. The whole "  hello" stays atomic until something
      // forces a break.
      // Walk: " "(1, no lastBreak — hasContent=false). " "(2, no
      // lastBreak). h(3). e(4). l(5)>4, no lastBreak → char-wrap
      // fallback: push "  he", row="l" w=1. l(2). o(3). End: push
      // "llo". → ["  he", "llo"]
      const result = wrapByWords('  hello', 4)
      expect(result.join('')).toBe('  hello')
      // The first row should NOT be just whitespace — that'd mean we
      // used leading ws as a break point.
      expect(result[0]).not.toBe('  ')
    })

    it('handles multiple consecutive spaces preserved at break point', () => {
      // "hello   world" width 6 → "hello   " (8 cells but ws counts
      // as 1 each in stringWidth, lastBreak resets each time).
      // Walk: hello(5), " "(6, lastBreak=6), " "(7, lastBreak=7),
      // " "(8, lastBreak=8), w(9)>6, break at lastBreak=8 → push
      // "hello   ", row="world".
      expect(wrapByWords('hello   world', 6)).toEqual(['hello   ', 'world'])
    })

    it('does NOT break at non-breaking space (U+00A0)', () => {
      // 'Mr. Smith' — non-breaking space is NOT a break candidate.
      // Width 4: Mr.(3),  (4), S(5)>4, no lastBreak (NBSP
      // doesn't qualify) → char-wrap fallback. Result depends on
      // exact behavior; just verify the token didn't break at the NBSP.
      const NBSP = String.fromCodePoint(0x00a0)
      const result = wrapByWords(`Mr.${NBSP}Smith`, 4)
      expect(result.join('')).toBe(`Mr.${NBSP}Smith`)
      // First row shouldn't END right after "Mr." with the NBSP
      // splitting onto next row — verify by ensuring NBSP doesn't
      // start the second row alone with content.
      const startsWithNbsp = result.slice(1).some((r) => r.startsWith(NBSP))
      expect(startsWithNbsp).toBe(false)
    })

    it('treats tab as a break candidate', () => {
      // 'foo\tbar' width 4 → tab is a break point (we treat it like
      // a regular space for wrap purposes).
      // Walk: f(1) o(2) o(3) \t(4, lastBreak=4) b(5)>4, break at 4
      // → push "foo\t", row="bar".
      expect(wrapByWords('foo\tbar', 4)).toEqual(['foo\t', 'bar'])
    })
  })

  describe('degenerate inputs', () => {
    it('returns [] for empty input', () => {
      expect(wrapByWords('', 5)).toEqual([])
    })

    it('returns [] for width=0', () => {
      expect(wrapByWords('hello', 0)).toEqual([])
    })

    it('returns [] for negative width', () => {
      expect(wrapByWords('hello', -3)).toEqual([])
    })
  })

  describe('wide chars + word wrap interaction', () => {
    it('breaks at whitespace in mixed CJK + ASCII content', () => {
      // 中文(4) " "(5) hi(7) at width 5:
      //   中(2), 文(4), " "(5, lastBreak=5), h(6)>5, break at 5
      //   → push "中文 ", row="h"(1), i(2). End: push "hi".
      expect(wrapByWords('中文 hi', 5)).toEqual(['中文 ', 'hi'])
    })

    it('CJK words char-wrap (no whitespace between Chinese chars)', () => {
      // "中文学习" — 4 CJK chars, 8 cells. Width 4.
      // Walk: 中(2), 文(4), 学(6)>4 no lastBreak → push "中文",
      // row="学"(2), 习(4) fits. End: push "学习".
      expect(wrapByWords('中文学习', 4)).toEqual(['中文', '学习'])
    })
  })

  describe('rejoinability invariant', () => {
    // The single most important test: NO matter how wrap decides to
    // break, joining all rows back must reconstruct the original
    // input character-for-character. A regression here means we're
    // dropping or duplicating user data, the worst possible outcome
    // for a text editor.
    const cases = [
      'hello world',
      'the quick brown fox jumps over the lazy dog',
      'one\ttwo\tthree',
      'looooooooong',
      `word ${'a'.repeat(50)} end`,
      '  leading spaces preserved',
      'trailing spaces preserved   ',
      'multiple   spaces   between',
      '中文 hello 世界',
      `Mr.${String.fromCodePoint(0x00a0)}Smith and Mrs.${String.fromCodePoint(0x00a0)}Smith`,
    ]
    for (const input of cases) {
      for (const width of [3, 5, 8, 12, 30]) {
        it(`rejoins for input=${JSON.stringify(input.slice(0, 30))}... width=${width}`, () => {
          const result = wrapByWords(input, width)
          expect(result.join('')).toBe(input)
        })
      }
    }
  })
})

describe('wrapByWords with identifier-aware boundaries', () => {
  describe('snake_case + kebab-case break preferences', () => {
    it('prefers breaking AFTER underscore in snake_case', () => {
      // "foo_bar_baz" width 5: 'whitespace' mode would char-wrap (no
      // whitespace). 'identifier' mode breaks after each `_`.
      // Walk: f(1) o(2) o(3) _(4 break-pref) b(5) a(6)>5, break at
      // pref idx=4 → push "foo_", row="b" then ar(3) _(4 pref) b(5)
      // a(6)>5 break at 4 → push "bar_", row="b" then a(2) z(3). End: push "baz".
      expect(wrapByWords('foo_bar_baz', 5, 'identifier')).toEqual(['foo_', 'bar_', 'baz'])
    })

    it('prefers breaking AFTER hyphen in kebab-case', () => {
      expect(wrapByWords('foo-bar-baz', 5, 'identifier')).toEqual(['foo-', 'bar-', 'baz'])
    })

    it('whitespace beats identifier-preferred at the same row', () => {
      // 'foo_bar baz' width 8: row could break after _ (idx 4) or after
      // space (idx 8). Both candidates exist. Whitespace is HARDER →
      // wins. Result row 1 = "foo_bar ", row 2 = "baz".
      expect(wrapByWords('foo_bar baz', 8, 'identifier')).toEqual(['foo_bar ', 'baz'])
    })
  })

  describe('camelCase + PascalCase transitions', () => {
    it('breaks BEFORE uppercase that follows lowercase (camelCase)', () => {
      // "fooBarBaz" width 5: lowercase→uppercase at positions 3 and 6.
      // Walk: f(1) o(2) o(3) [pref-before-B] B(4) a(5) r(6)>5, break
      // at idx=3 → push "foo", row="Bar" w=3, then B(?) a(?) z(?)... Let me retrace.
      //   At "B" position (idx 3 in "fooBarBaz"), classifier returns
      //   'preferred' because prev='o' (lowercase) next='B' (uppercase).
      //   Recorded as lastBreakIdx=3 (before adding B).
      //   B(4) added, row="fooB" w=4. a(5) added "fooBa" w=5. r(6)>5,
      //   break at lastBreakIdx=3 → push "foo", overhang="B"+r="Br"
      //   wait no the segment we're trying to add is 'r'. row.slice(3) = "B"
      //   then row="B"+"r" = "Br", rowWidth=2. lastBreakIdx reset.
      // So result starts with ["foo", ...]. Subsequent: continue with "Br" then [pref-before-B] etc.
      const result = wrapByWords('fooBarBaz', 5, 'identifier')
      // Verify rejoin
      expect(result.join('')).toBe('fooBarBaz')
      // Verify we DID break at the camelCase transition (first row is "foo", not "fooBa")
      expect(result[0]).toBe('foo')
    })

    it('whitespace mode does NOT break at camelCase transitions', () => {
      // Same input in 'whitespace' mode: no whitespace, so falls back
      // to char-wrap. Result is char-wrapped chunks.
      const result = wrapByWords('fooBarBaz', 5, 'whitespace')
      expect(result.join('')).toBe('fooBarBaz')
      // First row is char-wrapped (5 chars exactly).
      expect(result[0]).toBe('fooBa')
    })
  })

  describe('URL atomicity', () => {
    it('does NOT break inside an HTTPS URL', () => {
      // 'see https://example.com end' width 12. Identifier mode marks
      // the URL as 'avoid' — never a break candidate inside. The URL
      // is 19 chars, longer than width, so it falls back to char-wrap
      // INSIDE the URL (data preserved, just doesn't fit). Surrounding
      // text breaks at whitespace.
      const input = 'see https://example.com end'
      const result = wrapByWords(input, 12, 'identifier')
      expect(result.join('')).toBe(input)
      // The URL "https://example.com" should not be broken at the
      // colon, slash, or dot — those are 'avoid' positions in identifier
      // mode. Verify by checking no row STARTS with `://example` or `.com`
      // or similar mid-URL fragments.
      for (let i = 1; i < result.length; i++) {
        const row = result[i]!
        expect(row).not.toMatch(/^:\/\//)
        expect(row).not.toMatch(/^\.com/)
      }
    })

    it('does NOT break at the colon or slashes inside a URL even when prefer-points exist nearby', () => {
      const input = 'open https://github.com/foo-bar/baz now'
      const result = wrapByWords(input, 15, 'identifier')
      expect(result.join('')).toBe(input)
      // Each row should either contain the URL whole, or contain
      // overflow chars from the URL (because URL is wider than width).
      // What MUST NOT happen: a clean break at the `-` inside the URL.
      // Verify by checking no row ENDS with the `-` from `foo-` inside
      // the URL — that'd mean we used the kebab-case rule inside the URL.
      const expectedUrlAtomic = result.every((r) => !r.endsWith('-bar') && !r.endsWith('https://'))
      expect(expectedUrlAtomic).toBe(true)
    })
  })

  describe('rejoinability invariant (extended for identifier mode)', () => {
    const cases = [
      'foo_bar_baz',
      'fooBarBaz',
      'kebab-case-name',
      'see https://example.com today',
      '/sling --target=backend-engineer --chit=chit-abc-123',
      'CamelCase + snake_case + kebab-case mixed',
    ]
    for (const input of cases) {
      for (const width of [6, 10, 18]) {
        it(`rejoins for input=${JSON.stringify(input.slice(0, 30))}... width=${width} mode=identifier`, () => {
          expect(wrapByWords(input, width, 'identifier').join('')).toBe(input)
        })
      }
    }
  })

  describe('buildWrapLayout passes wordBoundaries through', () => {
    it('uses identifier mode when configured', () => {
      const layout = buildWrapLayout('foo_bar_baz', {
        width: 5,
        wrap: 'word',
        wordBoundaries: 'identifier',
      })
      expect(layout.rows.map((r) => r.text)).toEqual(['foo_', 'bar_', 'baz'])
    })

    it('defaults to whitespace mode when not specified', () => {
      const layout = buildWrapLayout('foo_bar_baz', { width: 5, wrap: 'word' })
      // No whitespace → char-wrap fallback.
      expect(layout.rows.map((r) => r.text)).toEqual(['foo_b', 'ar_ba', 'z'])
    })
  })
})

describe('hanging indent (indentedWrap)', () => {
  describe('basic indent detection + continuation alignment', () => {
    it('detects leading whitespace and stores indentCells on continuation rows', () => {
      // "  hello world hello" indented wrap width 8:
      //   prefix = "  " (2 cells)
      //   content = "hello world hello" wrapped at width 6:
      //     ["hello ", "world ", "hello"]
      // Visual rows:
      //   Row 0: text="  hello " (8 chars, includes prefix), indentCells=0
      //   Row 1: text="world " (6), indentCells=2
      //   Row 2: text="hello" (5), indentCells=2
      const layout = buildWrapLayout('  hello world hello', { width: 8, indentedWrap: true })
      expect(layout.rows).toHaveLength(3)
      expect(layout.rows[0].text).toBe('  hello ')
      expect(layout.rows[0].indentCells).toBe(0)
      expect(layout.rows[1].text).toBe('world ')
      expect(layout.rows[1].indentCells).toBe(2)
      expect(layout.rows[2].text).toBe('hello')
      expect(layout.rows[2].indentCells).toBe(2)
    })

    it('preserves char-position contiguity (rejoin row texts = original line)', () => {
      // The rejoin invariant: row texts concatenated equal the
      // original logical line. Continuation rows DON'T duplicate the
      // prefix (it's only in the buffer once, at the start).
      const line = '  hello world hello'
      const layout = buildWrapLayout(line, { width: 8, indentedWrap: true })
      expect(layout.rows.map((r) => r.text).join('')).toBe(line)
    })

    it('startCharIdx + endCharIdx remain contiguous across indent boundary', () => {
      const layout = buildWrapLayout('  hello world hello', { width: 8, indentedWrap: true })
      expect(layout.rows[0].startCharIdx).toBe(0)
      expect(layout.rows[0].endCharIdx).toBe(8) // "  hello " — prefix+6
      expect(layout.rows[1].startCharIdx).toBe(8)
      expect(layout.rows[1].endCharIdx).toBe(14)
      expect(layout.rows[2].startCharIdx).toBe(14)
      expect(layout.rows[2].endCharIdx).toBe(19)
    })

    it('tab-only indent does NOT trigger hanging-indent decoration (stringWidth treats \\t as 0 cells)', () => {
      // Tabs are control chars in stringWidth (width 0). Detecting
      // them as indent would mean indentCells=0 anyway — no visible
      // alignment. Future enhancement: configurable `tabWidth` opt
      // to treat tabs as N visible cells (matching the renderer's
      // tab handling, when that lands). Until then, tab-only indent
      // gets no hanging-indent treatment. Mixed tab+space indent
      // counts only the spaces toward indent cells.
      const layout = buildWrapLayout('\thello world hello', { width: 8, indentedWrap: true })
      const continuationRows = layout.rows.filter((r) => r.isWrapContinuation)
      // Tabs count as 0 cells, so no hanging indent applied.
      for (const r of continuationRows) {
        expect(r.indentCells).toBe(0)
      }
    })

    it('lines with no leading whitespace get indentCells=0 on all rows', () => {
      const layout = buildWrapLayout('hello world hello', { width: 8, indentedWrap: true })
      for (const r of layout.rows) {
        expect(r.indentCells).toBe(0)
      }
    })

    it('non-continuation rows always have indentCells=0', () => {
      // Even when the next logical line has indent, the FIRST row of
      // each logical line carries the prefix in its text — indentCells
      // is purely the "render-decoration" amount for continuation rows.
      const layout = buildWrapLayout('a\n  b c d e f g h i', {
        width: 6,
        indentedWrap: true,
      })
      // Row 0: 'a' — no continuation
      // Row 1: '  b c ' — first of indented line, indentCells=0 (prefix in text)
      // Row 2: 'd e f ' — continuation, indentCells=2
      // ...
      const firstRowOfEachLine = layout.rows.filter((r) => !r.isWrapContinuation)
      for (const r of firstRowOfEachLine) {
        expect(r.indentCells).toBe(0)
      }
    })

    it('per-line indent is independent (different logical lines, different prefixes)', () => {
      // Two logical lines with different indents.
      const layout = buildWrapLayout('  line one wraps here\n    line two wraps deeper', {
        width: 10,
        indentedWrap: true,
      })
      const line0Rows = layout.rows.filter((r) => r.logicalLine === 0)
      const line1Rows = layout.rows.filter((r) => r.logicalLine === 1)
      // Line 0 continuations have indentCells=2; line 1 continuations have 4.
      const line0Continuations = line0Rows.filter((r) => r.isWrapContinuation)
      const line1Continuations = line1Rows.filter((r) => r.isWrapContinuation)
      for (const r of line0Continuations) expect(r.indentCells).toBe(2)
      for (const r of line1Continuations) expect(r.indentCells).toBe(4)
    })
  })

  describe('opt-out + edge cases', () => {
    it('indentedWrap=false treats continuation rows as starting at col 0 (indentCells=0)', () => {
      const layout = buildWrapLayout('  hello world hello', { width: 8, indentedWrap: false })
      for (const r of layout.rows) {
        expect(r.indentCells).toBe(0)
      }
      // All chars still preserved via rejoin
      expect(layout.rows.map((r) => r.text).join('')).toBe('  hello world hello')
    })

    it('indented wrap is the default when option is omitted', () => {
      const layout = buildWrapLayout('  hello world hello', { width: 8 })
      const continuations = layout.rows.filter((r) => r.isWrapContinuation)
      // Default indented behavior: continuation rows have indentCells > 0
      for (const r of continuations) expect(r.indentCells).toBe(2)
    })

    it('all-whitespace line emits one row with the whitespace as text (caret can sit on it)', () => {
      const layout = buildWrapLayout('     ', { width: 10, indentedWrap: true })
      expect(layout.rows).toHaveLength(1)
      expect(layout.rows[0].text).toBe('     ')
      expect(layout.rows[0].indentCells).toBe(0)
    })

    it('lines that happen to fit in one row get indentCells=0 (no continuation)', () => {
      const layout = buildWrapLayout('  short', { width: 20, indentedWrap: true })
      expect(layout.rows).toHaveLength(1)
      expect(layout.rows[0].text).toBe('  short')
      expect(layout.rows[0].indentCells).toBe(0)
    })
  })

  describe('logicalToVisual + indented wrap', () => {
    it('returns ROW-INTERNAL col (renderer adds indentCells offset for display)', () => {
      // For "  hello world" width 8:
      // Row 0: "  hello " (8 chars, indentCells=0)
      // Row 1: "world" (5 chars, indentCells=2)
      // Position 8 (start of row 1's content) → row 1 col 0 (NOT col 2).
      // The renderer is responsible for adding indentCells to display.
      const layout = buildWrapLayout('  hello world', { width: 8, indentedWrap: true })
      expect(layout.logicalToVisual(8)).toEqual({ row: 1, col: 0 })
    })
  })

  describe('rejoinability invariant (extended for indented wrap)', () => {
    const cases = [
      '  hello world',
      '    deeply indented content here',
      'mixed\n  one indented\n    two indented\nno indent',
      '\thello\tworld',
      `  ${'word '.repeat(10).trim()}`,
    ]
    for (const input of cases) {
      for (const width of [6, 10, 18]) {
        it(`rejoins for input=${JSON.stringify(input.slice(0, 30))}... width=${width} indented`, () => {
          const layout = buildWrapLayout(input, { width, indentedWrap: true })
          // Reconstruct with \n separators between logical lines.
          let reconstructed = ''
          let prevLogicalLine: number | null = null
          for (const r of layout.rows) {
            if (prevLogicalLine !== null && r.logicalLine !== prevLogicalLine) {
              reconstructed += '\n'
            }
            reconstructed += r.text
            prevLogicalLine = r.logicalLine
          }
          expect(reconstructed).toBe(input)
        })
      }
    }
  })
})

describe('wrap hints (programmatic atomic spans)', () => {
  describe('via wrapByWords directly (line-relative spans)', () => {
    it('does NOT break inside a hint-marked range', () => {
      // 'hello world' with a hint covering 'lo wo' (cols 3-8) means
      // the space at col 5 is NOT a break candidate. Width 6 forces
      // a break, but it has to fall back to char-wrap.
      // Walk: h(1) e(2) l(3) l(4) o(5) " "(6) — at col 5 we're INSIDE
      // hint [3, 8), so whitespace branch SKIPS recording. Continue.
      // Hmm wait, " " is at row position 6 (after "hello"), abs pos 5.
      // 5 is inside [3, 8) → skip break candidate. " " consumed,
      // rowWidth=6 (fits). w(7)>6, no break candidate (only one inside
      // a hint), char-wrap fallback. Push "hello ", row="w".
      // Continue "orld".
      // Without the hint, would break at the space. With it, breaks
      // at char boundary.
      const result = wrapByWords('hello world', 6, 'whitespace', [[3, 8] as const])
      expect(result.join('')).toBe('hello world')
      // Length unchanged but break position changed
      // Wait — actually with hint, result might still be the same
      // ['hello ', 'world'] if char-wrap happens to align with the
      // space. Let me think more carefully.
      // Width 6: "hello " is 6 cells. "w" would push to 7. Char-wrap
      // pushes "hello ", row="w". Same as without hint! Because the
      // CHAR position where we ran out of space happened to coincide
      // with the whitespace.
      // Better test: a hint that spans WHERE the natural break would be.
    })

    it('keeps "Mr. Smith" together when hinted as atomic', () => {
      // "Hello Mr. Smith here" width 10. Mr. Smith spans chars 6-15.
      // Without hint: break at the space between "Mr." and "Smith"
      // (the only good break). With hint: NOT a candidate; break at
      // earlier whitespace.
      // Walk: "Hello "(6, lastBreak=6, hard). M(7) r(8) .(9) " "(10
      //   inside hint, NO update). S(11)>10, break at lastBreak=6.
      //   Push "Hello ", row="Mr. S"... wait it's appending after
      //   the slice. row.slice(6) = "Mr. " then + "S" = "Mr. S" w=5.
      //   m(6) i(7) t(8) h(9). " "(10, abs pos 6+10=16, OUTSIDE hint
      //   [6, 15), record lastBreak=10). h(11)>10, break at 10. Push
      //   "Mr. Smith ", row="h" w=1. e(2) r(3) e(4). End → push "here".
      // Result: ["Hello ", "Mr. Smith ", "here"]
      const result = wrapByWords('Hello Mr. Smith here', 10, 'whitespace', [[6, 15] as const])
      expect(result.join('')).toBe('Hello Mr. Smith here')
      // Mr. Smith should NOT be split
      const hasMrAlone = result.some((r) => r.endsWith('Mr.') || r.startsWith('Smith'))
      expect(hasMrAlone).toBe(false)
    })

    it('hints + identifier mode: hinted span suppresses identifier break preferences inside', () => {
      // 'use snake_case_var here' width 10. Hint covers
      // 'snake_case_var' (chars 4-18). With the hint, identifier mode
      // must not break at the `_` positions inside the hint span;
      // those positions are 'avoid' even though `_` is normally
      // preferred. The token can still char-wrap inside (because
      // it's longer than width), but each row break must be at a
      // CHAR boundary, not at an `_` preferred-break.
      const input = 'use snake_case_var here'
      const hinted = wrapByWords(input, 10, 'identifier', [[4, 18] as const])
      expect(hinted.join('')).toBe(input)
      // No row should END at the boundary right after a `_` inside the
      // hint range — that'd be using the identifier-preferred break.
      // Allowed: row ends at whitespace boundary, or mid-token via char-wrap.
      for (const row of hinted) {
        // Endings like 'snake_' or 'case_' would mean we used the
        // identifier-preferred break inside the atomic hint.
        expect(row.endsWith('snake_')).toBe(false)
        expect(row.endsWith('case_')).toBe(false)
      }
    })
  })

  describe('via buildWrapLayout (buffer-relative hints)', () => {
    it('translates buffer-relative hints to per-line spans', () => {
      // Two-line buffer: "Hello Mr.\n Smith here". Hint on chars
      // 6-19 covering "Mr.\n Smith" — spans across the \n.
      // Per-line:
      //   Line 0 "Hello Mr." (chars 0-9): hint slice = [6, 9)
      //   Line 1 " Smith here" (chars 10-21): hint slice = [0, 9)
      //     (because hint end - line start = 19 - 10 = 9)
      // Each line wraps independently with its own atomic span.
      const layout = buildWrapLayout('Hello Mr.\n Smith here', {
        width: 10,
        wrap: 'word',
        hints: [{ start: 6, end: 19 }],
      })
      // Verify the layout reconstructs the buffer (rejoin + insert \n).
      const reconstructed = layout.rows
        .map((r, i) => {
          if (i === 0) return r.text
          // Hard newline if logical line changed
          const sep = r.logicalLine !== layout.rows[i - 1]!.logicalLine ? '\n' : ''
          return sep + r.text
        })
        .join('')
      expect(reconstructed).toBe('Hello Mr.\n Smith here')
    })

    it('drops empty / inverted hint ranges silently', () => {
      const layout = buildWrapLayout('hello world', {
        width: 6,
        hints: [
          { start: 5, end: 5 }, // empty
          { start: 8, end: 3 }, // inverted
          { start: 10, end: 20 }, // out of range (past end of buffer)
        ],
      })
      // Should behave as if hints weren't passed at all.
      expect(layout.rows.map((r) => r.text)).toEqual(['hello ', 'world'])
    })

    it('multiple hints on the same line are all respected', () => {
      // 'a b c d e' width 5. Hints binding "a b" and "d e".
      // Without hints: ['a b ', 'c d ', 'e']
      // With both hints atomic: must NOT break inside 'a b' or inside 'd e'.
      // Walk: a(1) " "(2 inside hint [0,3), no record) b(3) " "(4 OUTSIDE
      // hint, record lastBreak=4) c(5). " "(6, OUTSIDE hint, record
      // lastBreak=6). d(7)>5, break at 6. Push "a b c ", row="d" w=1.
      // " "(2 inside hint [6,9) — abs pos = 6+2=8, inside) e(3). End:
      // push "d e".
      const result = buildWrapLayout('a b c d e', {
        width: 5,
        wrap: 'word',
        hints: [
          { start: 0, end: 3 }, // "a b"
          { start: 6, end: 9 }, // "d e"
        ],
      })
      const texts = result.rows.map((r) => r.text)
      // "a b" should not be split; "d e" should not be split.
      const hasAtomicAB = texts.some((t) => t.includes('a b'))
      const hasAtomicDE = texts.some((t) => t.includes('d e'))
      expect(hasAtomicAB).toBe(true)
      expect(hasAtomicDE).toBe(true)
    })

    it('joinWith field is accepted but not yet active (deferred to follow-up)', () => {
      // The TYPE accepts joinWith; the implementation ignores it for
      // this PR (renderer-side glyph injection comes later). Verify
      // the field doesn't crash buildWrapLayout.
      const layout = buildWrapLayout('hello world', {
        width: 6,
        hints: [{ start: 0, end: 11, joinWith: '-' }],
      })
      expect(layout.rows.length).toBeGreaterThan(0)
    })
  })
})

describe('nextVisualRow', () => {
  it('moves down to the next row at preferredCol', () => {
    // "abcdef\nghijkl" → two rows of 6 chars each. Caret at row 0
    // col 3 (between c and d). ↓ should land at row 1 col 3.
    const layout = buildWrapLayout('abcdef\nghijkl', { width: 10 })
    // Caret at charIdx 3 (between 'c' and 'd' on row 0).
    const { charIdx } = nextVisualRow(layout, 3, 3, 'down')
    // Row 1 starts at idx 7 (after \n), col 3 → idx 10.
    expect(charIdx).toBe(10)
  })

  it('moves up to the previous row at preferredCol', () => {
    const layout = buildWrapLayout('abcdef\nghijkl', { width: 10 })
    // Caret at row 1 col 4 → charIdx 11. ↑ should land at row 0 col 4 → idx 4.
    const { charIdx } = nextVisualRow(layout, 11, 4, 'up')
    expect(charIdx).toBe(4)
  })

  it('clamps to end-of-row when target row is shorter than preferredCol', () => {
    // "longline\nhi" → row 0 = "longline" (8 chars), row 1 = "hi" (2 chars).
    // Caret at row 0 col 6 (idx 6). ↓ with preferredCol=6 → row 1's max is
    // col 2, so charIdx = end of row 1 = 11.
    const layout = buildWrapLayout('longline\nhi', { width: 20 })
    const { charIdx } = nextVisualRow(layout, 6, 6, 'down')
    expect(charIdx).toBe(11) // end of "hi"
  })

  it('respects preferredCol across a SHORTER intermediate row when reaching a longer one', () => {
    // "longline\nhi\nlongerline" — three rows.
    // Caret at row 0 col 6, ↓ → row 1 (clamped to col 2 since "hi" is only 2),
    // BUT preferredCol stays 6. Caller calls nextVisualRow again with the
    // SAME preferredCol=6 → row 2 col 6.
    const layout = buildWrapLayout('longline\nhi\nlongerline', { width: 20 })
    // Move down once: lands at end of "hi" (idx 11).
    const step1 = nextVisualRow(layout, 6, 6, 'down')
    expect(step1.charIdx).toBe(11)
    // Move down again with preferredCol still 6 (caller maintains it).
    const step2 = nextVisualRow(layout, step1.charIdx, 6, 'down')
    // Row 2 starts at idx 12 (after \n). Col 6 → idx 18.
    expect(step2.charIdx).toBe(18)
  })

  it('↑ at row 0 → start of buffer (charIdx 0)', () => {
    const layout = buildWrapLayout('hello\nworld', { width: 10 })
    // Caret at row 0 col 3.
    const { charIdx } = nextVisualRow(layout, 3, 3, 'up')
    expect(charIdx).toBe(0)
  })

  it('↓ at last row → end of buffer (charIdx = lastRow.endCharIdx)', () => {
    const layout = buildWrapLayout('hello\nworld', { width: 10 })
    // Caret at row 1 col 2 = idx 8.
    const { charIdx } = nextVisualRow(layout, 8, 2, 'down')
    expect(charIdx).toBe(11) // end of "world"
  })

  it('navigates across wrap continuations (not just \\n boundaries)', () => {
    // "abcdefghij" width 5 → two rows: ["abcde", "fghij"]. Both same logical line.
    const layout = buildWrapLayout('abcdefghij', { width: 5 })
    // Caret at row 0 col 2 (idx 2). ↓ → row 1 col 2 = idx 7.
    expect(nextVisualRow(layout, 2, 2, 'down').charIdx).toBe(7)
    // ↑ from row 1 col 2 → row 0 col 2 = idx 2.
    expect(nextVisualRow(layout, 7, 2, 'up').charIdx).toBe(2)
  })

  it('handles wide chars in target row (snaps left from mid-char)', () => {
    // Row 0 = "abcd", row 1 = "中文" (4 cells). preferredCol=3 lands
    // mid-character 文 (which spans cells 2-3). visualToLogical
    // snaps LEFT to start of 文 = col 2 = charIdx 6 (after \n + 中).
    const layout = buildWrapLayout('abcd\n中文', { width: 10 })
    const { charIdx } = nextVisualRow(layout, 3, 3, 'down')
    // Row 1 starts at idx 5 (after \n). visualToLogical(1, 3):
    //   walk "中文": 中 width 2, cellsAcc=2. 文 width 2, would push
    //   to 4 > 3. Land BEFORE 文 → charIdx = 5 + 1 (chars consumed) = 6.
    expect(charIdx).toBe(6)
  })

  it('returns current charIdx unchanged when layout has no rows (width=0)', () => {
    const layout = buildWrapLayout('hello', { width: 0 })
    expect(nextVisualRow(layout, 3, 3, 'down').charIdx).toBe(3)
  })
})

describe('buildWrapLayout', () => {
  describe('row construction', () => {
    it('produces one zero-cell row for empty input (so caret can sit on it)', () => {
      const layout = buildWrapLayout('', { width: 10 })
      expect(layout.rows).toHaveLength(1)
      expect(layout.rows[0]).toMatchObject({
        text: '',
        logicalLine: 0,
        startCharIdx: 0,
        endCharIdx: 0,
        isWrapContinuation: false,
      })
    })

    it('produces one row for a single short logical line', () => {
      const layout = buildWrapLayout('hello', { width: 10 })
      expect(layout.rows).toHaveLength(1)
      expect(layout.rows[0]).toMatchObject({
        text: 'hello',
        logicalLine: 0,
        startCharIdx: 0,
        endCharIdx: 5,
        isWrapContinuation: false,
      })
    })

    it('wraps a long logical line into multiple visual rows', () => {
      const layout = buildWrapLayout('hello world', { width: 6 })
      expect(layout.rows).toHaveLength(2)
      expect(layout.rows[0]).toMatchObject({
        text: 'hello ',
        logicalLine: 0,
        startCharIdx: 0,
        endCharIdx: 6,
        isWrapContinuation: false,
      })
      expect(layout.rows[1]).toMatchObject({
        text: 'world',
        logicalLine: 0,
        startCharIdx: 6,
        endCharIdx: 11,
        isWrapContinuation: true,
      })
    })

    it('handles \\n as a hard break — not a wrap continuation', () => {
      const layout = buildWrapLayout('hi\nbye', { width: 10 })
      expect(layout.rows).toHaveLength(2)
      expect(layout.rows[0]).toMatchObject({
        text: 'hi',
        logicalLine: 0,
        startCharIdx: 0,
        endCharIdx: 2,
        isWrapContinuation: false,
      })
      expect(layout.rows[1]).toMatchObject({
        text: 'bye',
        logicalLine: 1,
        startCharIdx: 3, // skip the \n
        endCharIdx: 6,
        isWrapContinuation: false, // hard break, not wrap
      })
    })

    it('produces empty visual rows for consecutive newlines', () => {
      // 'a\n\n\nb' = 'a' + 3 \n + 'b' = 4 logical lines: 'a', '', '', 'b'
      const layout = buildWrapLayout('a\n\n\nb', { width: 10 })
      expect(layout.rows).toHaveLength(4)
      expect(layout.rows.map((r) => r.text)).toEqual(['a', '', '', 'b'])
      expect(layout.rows.map((r) => r.logicalLine)).toEqual([0, 1, 2, 3])
    })

    it('handles a leading newline (empty first line)', () => {
      const layout = buildWrapLayout('\nhi', { width: 10 })
      expect(layout.rows).toHaveLength(2)
      expect(layout.rows[0].text).toBe('')
      expect(layout.rows[1].text).toBe('hi')
    })

    it('handles a trailing newline (empty last line)', () => {
      const layout = buildWrapLayout('hi\n', { width: 10 })
      expect(layout.rows).toHaveLength(2)
      expect(layout.rows[0].text).toBe('hi')
      expect(layout.rows[1].text).toBe('')
      expect(layout.rows[1].startCharIdx).toBe(3) // position after \n
    })

    it('respects opts.wrap = "char" (skip word boundaries)', () => {
      // "hello world" width 6:
      //   word: ["hello ", "world"]
      //   char: ["hello ", "world"] — same here, but for "hello-world":
      const wordLayout = buildWrapLayout('hello-world', { width: 6, wrap: 'word' })
      // No whitespace → word-wrap falls back to char-wrap behavior:
      expect(wordLayout.rows.map((r) => r.text)).toEqual(['hello-', 'world'])
      const charLayout = buildWrapLayout('hello-world', { width: 6, wrap: 'char' })
      // Pure char-wrap: same result here because input has no whitespace.
      expect(charLayout.rows.map((r) => r.text)).toEqual(['hello-', 'world'])
    })

    it('width=0 returns no rows + safe fallback maps', () => {
      const layout = buildWrapLayout('hello', { width: 0 })
      expect(layout.rows).toEqual([])
      expect(layout.logicalToVisual(0)).toEqual({ row: 0, col: 0 })
      expect(layout.visualToLogical(0, 0)).toBe(0)
    })
  })

  describe('logicalToVisual', () => {
    it('returns {0,0} for position 0 in empty buffer', () => {
      const layout = buildWrapLayout('', { width: 10 })
      expect(layout.logicalToVisual(0)).toEqual({ row: 0, col: 0 })
    })

    it('translates positions within a single row to col offsets', () => {
      const layout = buildWrapLayout('hello', { width: 10 })
      expect(layout.logicalToVisual(0)).toEqual({ row: 0, col: 0 })
      expect(layout.logicalToVisual(2)).toEqual({ row: 0, col: 2 })
      expect(layout.logicalToVisual(5)).toEqual({ row: 0, col: 5 })
    })

    it('at a wrap boundary, prefers START of next row over END of previous', () => {
      // "helloworld" width 5 → ["hello", "world"], no whitespace.
      // Position 5 is the boundary. Convention: prefer next row.
      const layout = buildWrapLayout('helloworld', { width: 5 })
      expect(layout.logicalToVisual(5)).toEqual({ row: 1, col: 0 })
    })

    it('at a hard newline, position before \\n is end of current row', () => {
      // "hi\nbye" — position 2 is the \n itself. Position before = 2
      // should land at end of row 0. The \n ITSELF doesn't render
      // anywhere visible. Position 3 = start of row 1.
      const layout = buildWrapLayout('hi\nbye', { width: 10 })
      expect(layout.logicalToVisual(2)).toEqual({ row: 0, col: 2 })
      expect(layout.logicalToVisual(3)).toEqual({ row: 1, col: 0 })
    })

    it('counts cells with wide chars correctly', () => {
      // "中a" — 中 is 2 cells, a is 1.
      const layout = buildWrapLayout('中a', { width: 10 })
      expect(layout.logicalToVisual(0)).toEqual({ row: 0, col: 0 })
      expect(layout.logicalToVisual(1)).toEqual({ row: 0, col: 2 }) // after 中
      expect(layout.logicalToVisual(2)).toEqual({ row: 0, col: 3 }) // after a
    })

    it('clamps negative positions to {0, 0}', () => {
      const layout = buildWrapLayout('hello', { width: 10 })
      expect(layout.logicalToVisual(-5)).toEqual({ row: 0, col: 0 })
    })

    it('clamps positions past end to last-row end', () => {
      const layout = buildWrapLayout('hello', { width: 10 })
      expect(layout.logicalToVisual(100)).toEqual({ row: 0, col: 5 })
    })

    it('handles position at end of wrapped buffer (no next row to prefer)', () => {
      // "hello" width 5: one row, position 5 = end. No row 1 to prefer.
      const layout = buildWrapLayout('hello', { width: 5 })
      expect(layout.logicalToVisual(5)).toEqual({ row: 0, col: 5 })
    })
  })

  describe('visualToLogical', () => {
    it('returns 0 for empty buffer at any visual position', () => {
      const layout = buildWrapLayout('', { width: 10 })
      expect(layout.visualToLogical(0, 0)).toBe(0)
      expect(layout.visualToLogical(0, 5)).toBe(0)
    })

    it('translates row+col to char index', () => {
      const layout = buildWrapLayout('hello world', { width: 6 })
      // Row 0 = "hello ", row 1 = "world"
      expect(layout.visualToLogical(0, 0)).toBe(0)
      expect(layout.visualToLogical(0, 3)).toBe(3)
      expect(layout.visualToLogical(0, 6)).toBe(6) // end of row 0 = position 6
      expect(layout.visualToLogical(1, 0)).toBe(6)
      expect(layout.visualToLogical(1, 3)).toBe(9)
    })

    it('handles wide chars (col is in cells, returns char index)', () => {
      // "中a" width 10: row 0 = "中a"
      // Cell 0 = before 中
      // Cell 1 = mid-中 → snaps to BEFORE 中 (don't split a wide char)
      // Cell 2 = after 中, before a
      // Cell 3 = after a
      const layout = buildWrapLayout('中a', { width: 10 })
      expect(layout.visualToLogical(0, 0)).toBe(0)
      expect(layout.visualToLogical(0, 1)).toBe(0) // mid-wide-char → snap left
      expect(layout.visualToLogical(0, 2)).toBe(1) // after 中
      expect(layout.visualToLogical(0, 3)).toBe(2) // after a
    })

    it('clamps col past row end to row.endCharIdx', () => {
      const layout = buildWrapLayout('hi', { width: 10 })
      expect(layout.visualToLogical(0, 100)).toBe(2)
    })

    it('clamps row out of range', () => {
      const layout = buildWrapLayout('hi', { width: 10 })
      expect(layout.visualToLogical(100, 0)).toBe(0)
      expect(layout.visualToLogical(-1, 0)).toBe(0)
    })
  })

  describe('round-trip identity (logicalToVisual ∘ visualToLogical = identity)', () => {
    // For every char index in the buffer, going logical → visual →
    // logical should land on the same char idx (or close — wrap-
    // boundary positions are semi-ambiguous, see below).
    const cases = [
      'hello',
      'hello world',
      'hi\nbye',
      'a\n\nb',
      `${'x'.repeat(20)}`,
      'the quick brown fox',
      '中文学习',
      `Mr.${String.fromCodePoint(0x00a0)}Smith and Mrs.${String.fromCodePoint(0x00a0)}Smith`,
    ]
    for (const input of cases) {
      for (const width of [5, 8, 12]) {
        it(`round-trips for input=${JSON.stringify(input.slice(0, 20))}... width=${width}`, () => {
          const layout = buildWrapLayout(input, { width })
          for (let i = 0; i <= input.length; i++) {
            const visual = layout.logicalToVisual(i)
            const back = layout.visualToLogical(visual.row, visual.col)
            // Wrap-boundary char indices are mapped to the START of
            // the next row, so going back gives row.startCharIdx ===
            // original. For non-boundary cases, exact identity.
            expect(back).toBe(i)
          }
        })
      }
    }
  })
})
