/**
 * Tests for DEC private mode helpers, specifically the DECSCUSR
 * (cursor style + blink) machinery introduced for the cursor-styling
 * PR. The 1-6 code matrix is enumerated explicitly so a regression
 * where someone swaps two codes shows up immediately rather than
 * "the cursor looks slightly different now."
 */

import { describe, expect, it } from 'vitest'
import { type CursorStyle, RESET_CURSOR_STYLE, decscusr, decscusrCode } from './dec.js'

const ESC = '\x1b'

describe('decscusrCode', () => {
  // Full matrix as a table of [style, blink, expected code]. Lifted
  // from the DECSCUSR spec — 1-6 are the visible cursor configurations
  // a terminal can be in. 0 (default) is reset, tested separately via
  // RESET_CURSOR_STYLE below.
  const matrix: ReadonlyArray<[CursorStyle, boolean, number]> = [
    ['block', true, 1], //  blinking block
    ['block', false, 2], //  steady block
    ['underline', true, 3], //  blinking underline
    ['underline', false, 4], //  steady underline
    ['bar', true, 5], //  blinking bar
    ['bar', false, 6], //  steady bar
  ]

  for (const [style, blink, expected] of matrix) {
    it(`(${style}, blink=${blink}) → ${expected}`, () => {
      expect(decscusrCode(style, blink)).toBe(expected)
    })
  }
})

describe('decscusr', () => {
  it('emits CSI Ps SP q with literal space before q', () => {
    // The space matters — `CSI 5 q` is a totally different sequence
    // (DECSED selective erase). DECSCUSR is `CSI Ps SP q`.
    expect(decscusr(1)).toBe(`${ESC}[1 q`)
    expect(decscusr(6)).toBe(`${ESC}[6 q`)
  })

  it('accepts 0 (reset to terminal default)', () => {
    expect(decscusr(0)).toBe(`${ESC}[0 q`)
  })

  it('handles multi-digit codes (defensive — DECSCUSR codes are 0-6)', () => {
    // Future DECSCUSR codes may exist (some terminals extend); the
    // helper shouldn't break.
    expect(decscusr(10)).toBe(`${ESC}[10 q`)
  })
})

describe('RESET_CURSOR_STYLE', () => {
  it('is `CSI 0 SP q`', () => {
    // Hardcoded for clarity — the constant is what most callers use,
    // bypassing decscusr(). A regression here breaks every cleanup
    // path that restores the terminal default cursor.
    expect(RESET_CURSOR_STYLE).toBe(`${ESC}[0 q`)
  })

  it('matches decscusr(0)', () => {
    expect(RESET_CURSOR_STYLE).toBe(decscusr(0))
  })
})
