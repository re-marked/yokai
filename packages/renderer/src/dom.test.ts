/**
 * Unit tests for the text-node measure helper bound onto each
 * `ink-text` yoga node via `setMeasureFunc`. The function decides
 * what (width, height) yoga sees during intrinsic measurement
 * (basis) and during the perform-layout (Exactly) pass — and that
 * decision is load-bearing because mis-reporting dimensions during
 * the basis pass cascades into a wrong flex distribution and
 * downstream truncation, even when the parent has abundant space
 * (shakedown A1 / A5 — issues #51 and #58).
 *
 * Invariant: in `Undefined` mode (yoga is asking "what's your
 * intrinsic size? no constraint") the function MUST return the
 * natural dimensions. Wrapping or truncating here would poison the
 * basis with a width derived from an imaginary constraint — most
 * visibly for `truncate` mode, where `wrapText(…, NaN, 'truncate')`
 * appends an ellipsis to the natural string and inflates the basis
 * by one cell. In `AtMost` mode the function may wrap to fit; in
 * `Exactly` mode wrapping is required.
 */

import { describe, expect, it } from 'vitest'
import {
  type DOMElement,
  appendChildNode,
  createNode,
  createTextNode,
  measureTextNode,
  setStyle,
} from './dom.js'
import { LayoutMeasureMode } from './layout/node.js'
import type { Styles } from './styles.js'

/** Build an ink-text node with a single text child. */
function inkText(text: string, style: Styles = {}): DOMElement {
  const node = createNode('ink-text')
  setStyle(node, style)
  appendChildNode(node, createTextNode(text) as unknown as DOMElement)
  return node
}

describe('measureTextNode — Undefined mode returns natural dimensions (A1/A5, #51/#58)', () => {
  it('truncate-mode text in Undefined mode returns natural width (no ellipsis poisoning)', () => {
    // The A1 root cause. Yoga's column-direction basis pass calls
    // measureFunc with widthMode=Undefined (NaN width). Pre-fix, the
    // truncate branch fired and `wrapText(text, NaN, 'truncate')`
    // appended an ellipsis — measureText then reported width = 17
    // (natural 16 + ellipsis) instead of natural 16. The inflated
    // basis poisons flex distribution downstream.
    const node = inkText('13:47:04 · May 3', { textWrap: 'truncate' })
    const result = measureTextNode(node, Number.NaN, LayoutMeasureMode.Undefined)
    expect(result).toEqual({ width: 16, height: 1 })
  })

  it('wrap-mode text in Undefined mode returns natural width (no premature wrapping)', () => {
    // Same invariant on wrap mode. The natural width must come back
    // unaltered so the basis pass sees the true intrinsic size.
    const node = inkText('A longer line that could wrap', { textWrap: 'wrap' })
    const result = measureTextNode(node, Number.NaN, LayoutMeasureMode.Undefined)
    expect(result).toEqual({ width: 29, height: 1 })
  })

  it('truncate-middle in Undefined mode returns natural width', () => {
    const node = inkText('Lorem ipsum dolor', { textWrap: 'truncate-middle' })
    const result = measureTextNode(node, Number.NaN, LayoutMeasureMode.Undefined)
    expect(result).toEqual({ width: 17, height: 1 })
  })

  it('truncate-start in Undefined mode returns natural width', () => {
    const node = inkText('foo bar baz', { textWrap: 'truncate-start' })
    const result = measureTextNode(node, Number.NaN, LayoutMeasureMode.Undefined)
    expect(result).toEqual({ width: 11, height: 1 })
  })

  it('multi-line text in Undefined mode returns natural (widest line, line count)', () => {
    // Pre-existing handling for embedded newlines already returns
    // natural in Undefined mode. Pin it so a future refactor doesn't
    // regress this path.
    const node = inkText('line one\nline two longer\nthird', { textWrap: 'wrap' })
    const result = measureTextNode(node, Number.NaN, LayoutMeasureMode.Undefined)
    expect(result.height).toBe(3)
    expect(result.width).toBe('line two longer'.length)
  })
})

describe('measureTextNode — AtMost mode wraps/truncates to fit', () => {
  it('wraps wrap-mode text that exceeds the available width', () => {
    const node = inkText('one two three four', { textWrap: 'wrap' })
    const result = measureTextNode(node, 10, LayoutMeasureMode.AtMost)
    expect(result.width).toBeLessThanOrEqual(10)
    expect(result.height).toBeGreaterThan(1)
  })

  it('returns natural when natural width fits within AtMost', () => {
    const node = inkText('short', { textWrap: 'wrap' })
    const result = measureTextNode(node, 80, LayoutMeasureMode.AtMost)
    expect(result).toEqual({ width: 5, height: 1 })
  })

  it('truncates truncate-mode text that exceeds the available width', () => {
    const node = inkText('thirteen chars', { textWrap: 'truncate' })
    const result = measureTextNode(node, 8, LayoutMeasureMode.AtMost)
    // Width reported by measureText on the truncated output.
    expect(result.width).toBeLessThanOrEqual(8)
    expect(result.height).toBe(1)
  })
})

describe('measureTextNode — Exactly mode behaves like AtMost for current callers', () => {
  // The mode is provided by yoga for spec correctness; in practice
  // the path inside measureTextNode treats Exactly and AtMost
  // identically (both wrap when natural exceeds width). Pin the
  // observable behavior so a future refactor that splits these
  // modes makes a deliberate, reviewed decision.
  it('Exactly mode with natural width fitting returns natural', () => {
    const node = inkText('short', { textWrap: 'wrap' })
    const result = measureTextNode(node, 10, LayoutMeasureMode.Exactly)
    expect(result).toEqual({ width: 5, height: 1 })
  })
})
