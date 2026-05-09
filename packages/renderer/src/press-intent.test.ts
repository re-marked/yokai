/**
 * Truth-table coverage of computePressIntent. The function is pure and
 * branch-free except for the guards, so the tests are exhaustive over
 * the {gesture × clickable × forceSelect} space — 12 combinations.
 *
 * The intent enum is the load-bearing API: App.handleMouseEvent
 * branches on the result, integration tests assert the resulting
 * behaviors, and a wrong cell here would silently regress B8 (clicks
 * lost to selection) or its inverse (selection lost to clicks). Worth
 * a paranoid table.
 */

import { describe, expect, it } from 'vitest'
import { computePressIntent } from './press-intent.js'

describe('computePressIntent', () => {
  describe('confirmed gesture overrides everything', () => {
    it.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])('clickable=%s, forceSelect=%s → gesture-confirmed', (clickable, forceSelect) => {
      expect(computePressIntent({ gesture: 'confirmed', clickable, forceSelect })).toBe(
        'gesture-confirmed',
      )
    })
  })

  describe('tentative gesture overrides everything', () => {
    it.each([
      [false, false],
      [false, true],
      [true, false],
      [true, true],
    ])('clickable=%s, forceSelect=%s → gesture-tentative', (clickable, forceSelect) => {
      expect(computePressIntent({ gesture: 'tentative', clickable, forceSelect })).toBe(
        'gesture-tentative',
      )
    })
  })

  describe('no gesture', () => {
    it('clickable + !forceSelect → click', () => {
      expect(computePressIntent({ gesture: null, clickable: true, forceSelect: false })).toBe(
        'click',
      )
    })

    it('clickable + forceSelect → select (modifier escape hatch)', () => {
      // Shift-drag or Alt-drag over a Button label should select the
      // text underneath, not eat the press as a click.
      expect(computePressIntent({ gesture: null, clickable: true, forceSelect: true })).toBe(
        'select',
      )
    })

    it('!clickable + !forceSelect → select (default)', () => {
      expect(computePressIntent({ gesture: null, clickable: false, forceSelect: false })).toBe(
        'select',
      )
    })

    it('!clickable + forceSelect → select (modifier still says select)', () => {
      // Force-select on plain text behaves the same as no modifier —
      // selection starts either way. Tested for completeness so a future
      // refactor doesn't accidentally treat forceSelect as a positive
      // signal that overrides a default.
      expect(computePressIntent({ gesture: null, clickable: false, forceSelect: true })).toBe(
        'select',
      )
    })
  })
})
