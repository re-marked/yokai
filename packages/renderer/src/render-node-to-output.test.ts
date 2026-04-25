/**
 * Render-pipeline integration tests.
 *
 * These tests construct a small DOM tree (via the same primitives the
 * reconciler uses), run Yoga layout, invoke renderNodeToOutput against
 * a fresh Output buffer, and inspect the resulting Screen cell-by-cell
 * to verify what got painted where.
 *
 * Helpers in this file are deliberately not exported — they're test
 * scaffolding, not public API. If a second render-pipeline test file
 * appears later we can promote them to a shared internal helpers module.
 */

import { describe, expect, it } from 'vitest'
import { type DOMElement, appendChildNode, createNode, createTextNode, setStyle } from './dom.js'
import Output from './output.js'
import renderNodeToOutput from './render-node-to-output.js'
import { CharPool, HyperlinkPool, type Screen, StylePool, cellAt, createScreen } from './screen.js'
import applyStyles, { type Styles } from './styles.js'

// ── helpers ──────────────────────────────────────────────────────────

/**
 * Build an ink-box (or other element) with styles applied to both the
 * JS-side style record AND the underlying yoga node. Mirrors what the
 * reconciler does on createInstance + applyProp('style').
 */
function el(name: 'ink-box' | 'ink-text' | 'ink-root', style: Styles = {}): DOMElement {
  const node = createNode(name)
  setStyle(node, style)
  if (node.yogaNode) applyStyles(node.yogaNode, style)
  return node
}

/**
 * Build a Text container holding a single text node. Mirrors the JSX
 * form `<Text>{value}</Text>` which the reconciler expands to an
 * ink-text element with one #text child.
 */
function txt(value: string, style: Styles = {}): DOMElement {
  const t = el('ink-text', style)
  const node = createTextNode(value) as unknown as DOMElement
  appendChildNode(t, node)
  return t
}

/**
 * Build a root with the given children laid out as a horizontal row
 * (flexDirection: 'row'). Yoga's default is 'column' which would stack
 * siblings vertically — for a 1-row test viewport that means everything
 * past the first sibling gets clipped. Tests that need vertical stacking
 * should use buildColumn instead.
 */
function buildRow(width: number, height: number, ...children: DOMElement[]): DOMElement {
  const root = el('ink-root', { width, height, flexDirection: 'row' })
  for (const child of children) appendChildNode(root, child)
  root.yogaNode!.calculateLayout(width, height)
  return root
}

/**
 * Render to a fresh Screen and return it. One-shot — no Output reuse,
 * no prevScreen, no contamination concerns. Tests get a clean slate.
 */
function render(root: DOMElement, width: number, height: number): Screen {
  const stylePool = new StylePool()
  const charPool = new CharPool()
  const hyperlinkPool = new HyperlinkPool()
  const screen = createScreen(width, height, stylePool, charPool, hyperlinkPool)
  const output = new Output({ width, height, stylePool, screen })
  renderNodeToOutput(root, output, { prevScreen: undefined })
  return output.get()
}

/** Read the visible character at (x, y). Empty string if no cell painted. */
function charAt(screen: Screen, x: number, y: number): string {
  const cell = cellAt(screen, x, y)
  return cell?.char ?? ''
}

/** Read the full row as a string, trimmed of trailing empty cells. */
function rowText(screen: Screen, y: number): string {
  let out = ''
  for (let x = 0; x < screen.width; x++) {
    const c = cellAt(screen, x, y)
    out += c?.char || ' '
  }
  return out.replace(/ +$/, '')
}

// ── baseline: paint order before any z-index logic ───────────────────

describe('renderNodeToOutput — paint order baseline (no zIndex)', () => {
  it('paints a single text node at its computed position', () => {
    const root = buildRow(10, 1, txt('hello'))
    const screen = render(root, 10, 1)
    expect(rowText(screen, 0)).toBe('hello')
  })

  it('lays out two in-flow row siblings side by side', () => {
    const root = buildRow(10, 1, txt('AB'), txt('CD'))
    const screen = render(root, 10, 1)
    expect(rowText(screen, 0)).toBe('ABCD')
  })

  it('absolute child paints over later in-flow siblings (today)', () => {
    // Two in-flow siblings filling row 0, plus an absolute box positioned
    // over the FIRST cell. Tree order: in-flow first, absolute last.
    // Today's behavior: absolute's later position in operations wins.
    const inflowA = txt('A')
    const inflowB = txt('B')
    const overlay = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
    })
    appendChildNode(overlay, txt('X'))

    const root = buildRow(5, 1, inflowA, inflowB, overlay)
    const screen = render(root, 5, 1)
    // 'A' was at col 0; overlay 'X' paints over → 'X' wins
    expect(charAt(screen, 0, 0)).toBe('X')
    expect(charAt(screen, 1, 0)).toBe('B')
  })

  it('two overlapping absolute siblings: later in tree paints on top', () => {
    // Both absolute at the same (top, left). Tree-order tiebreaker: later
    // in tree wins. This is the existing behavior we preserve when no
    // zIndex is set — z-index sort is a stable sort over tree order.
    const first = el('ink-box', { position: 'absolute', top: 0, left: 0, width: 3, height: 1 })
    appendChildNode(first, txt('111'))
    const second = el('ink-box', { position: 'absolute', top: 0, left: 0, width: 3, height: 1 })
    appendChildNode(second, txt('222'))

    const root = buildRow(5, 1, first, second)
    const screen = render(root, 5, 1)
    expect(rowText(screen, 0)).toBe('222')
  })

  it('absolute earlier in tree paints UNDER later in-flow (today)', () => {
    // The interesting half of "tree order = paint order": even an
    // absolute element loses to a later in-flow sibling overlapping the
    // same cell. Today this is just because the in-flow sibling's
    // operations come later in the buffer.
    const overlayFirst = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
    })
    appendChildNode(overlayFirst, txt('X'))
    const inflow = txt('I')

    const root = buildRow(5, 1, overlayFirst, inflow)
    const screen = render(root, 5, 1)
    // overlay 'X' paints first, then 'I' paints over → 'I' wins
    expect(charAt(screen, 0, 0)).toBe('I')
  })
})
