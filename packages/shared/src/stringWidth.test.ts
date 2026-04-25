import { describe, expect, it } from 'vitest'
import { stringWidth } from './stringWidth.js'

describe('stringWidth', () => {
  describe('basic strings', () => {
    it('returns 0 for empty string', () => {
      expect(stringWidth('')).toBe(0)
    })

    it('counts each ASCII character as width 1', () => {
      expect(stringWidth('hello')).toBe(5)
      expect(stringWidth('a')).toBe(1)
      expect(stringWidth('hello world')).toBe(11)
    })

    it('returns 0 for non-string inputs', () => {
      // The signature claims string, but the runtime guard handles
      // anything React might flatten through JSX children.
      // biome-ignore lint/suspicious/noExplicitAny: testing the runtime guard
      expect(stringWidth(undefined as any)).toBe(0)
      // biome-ignore lint/suspicious/noExplicitAny: testing the runtime guard
      expect(stringWidth(null as any)).toBe(0)
    })
  })

  describe('control characters', () => {
    it('skips control characters in pure-ASCII fast path', () => {
      // Tab, backspace, etc. are 0-width in terminal display.
      expect(stringWidth('a\tb')).toBe(2)
      expect(stringWidth('\x00\x01\x02')).toBe(0)
    })
  })

  describe('ANSI escape sequences', () => {
    it('strips ANSI codes before counting', () => {
      // ESC[31m = red, ESC[0m = reset. Both are 0-width.
      expect(stringWidth('\x1b[31mred\x1b[0m')).toBe(3)
    })

    it('returns 0 for a string that is only ANSI codes', () => {
      expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
    })
  })

  describe('wide characters (East Asian)', () => {
    it('counts CJK characters as width 2', () => {
      expect(stringWidth('你好')).toBe(4)
      expect(stringWidth('日本語')).toBe(6)
    })

    it('mixes ASCII and CJK correctly', () => {
      expect(stringWidth('hi 你好')).toBe(7) // 'hi ' = 3, '你好' = 4
    })

    it('treats true-ambiguous BMP characters as narrow', () => {
      // U+2030 (per mille sign) is east-asian-ambiguous and not in any
      // emoji range — eastAsianWidth(ambiguousAsWide: false) → 1.
      expect(stringWidth('‰')).toBe(1)
    })

    it('treats symbols in the emoji-symbol range as wide', () => {
      // U+26A0 (⚠ warning sign) is *also* east-asian-ambiguous, but it
      // sits in U+2600-U+27BF which needsSegmentation() flags for emoji
      // processing. Modern terminals render it at width 2 with a colored
      // glyph; matching that is the right call for visual alignment.
      expect(stringWidth('⚠')).toBe(2)
    })
  })

  describe('emoji', () => {
    it('counts simple emoji as width 2', () => {
      expect(stringWidth('🎉')).toBe(2)
    })

    it('counts a single regional indicator as width 1', () => {
      // A lone regional indicator (e.g. U+1F1FA without a pair) is
      // intentionally narrow — only flag pairs render at width 2.
      expect(stringWidth('\u{1F1FA}')).toBe(1)
    })

    it('counts a flag (regional indicator pair) as width 2', () => {
      // U+1F1FA + U+1F1F8 = 🇺🇸
      expect(stringWidth('\u{1F1FA}\u{1F1F8}')).toBe(2)
    })

    it('counts ZWJ-joined family emoji as a single grapheme', () => {
      // 👨‍👩‍👧 = man + ZWJ + woman + ZWJ + girl. Renders as one cluster.
      expect(stringWidth('\u{1F468}\u{200D}\u{1F469}\u{200D}\u{1F467}')).toBe(2)
    })
  })

  describe('zero-width and combining marks', () => {
    it('treats combining diacritics as 0-width', () => {
      // 'a' + combining acute accent (U+0301) = á, width 1
      expect(stringWidth('á')).toBe(1)
    })

    it('treats variation selectors as 0-width', () => {
      // VS-16 (U+FE0F) is the emoji presentation selector
      expect(stringWidth('️')).toBe(0)
    })

    it('treats zero-width joiner as 0-width', () => {
      expect(stringWidth('‍')).toBe(0)
    })

    it('treats BOM as 0-width', () => {
      expect(stringWidth('﻿')).toBe(0)
    })
  })
})
