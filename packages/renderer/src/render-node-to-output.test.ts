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

// ── z-index: paint-order overrides ───────────────────────────────────

describe('renderNodeToOutput — zIndex paint ordering', () => {
  it('higher zIndex paints over lower, regardless of tree order', () => {
    // first appears earlier in the tree (would normally paint UNDER second)
    // but its zIndex={2} beats second's zIndex={1}, so first wins.
    const first = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 3,
      height: 1,
      zIndex: 2,
    })
    appendChildNode(first, txt('AAA'))
    const second = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 3,
      height: 1,
      zIndex: 1,
    })
    appendChildNode(second, txt('BBB'))

    const root = buildRow(5, 1, first, second)
    const screen = render(root, 5, 1)
    expect(rowText(screen, 0)).toBe('AAA')
  })

  it('zIndex={0} behaves identically to undefined (tree order preserved)', () => {
    // Explicit z=0 should not change anything — it's the same effective
    // value as no zIndex at all. Tree-order tiebreaker means second wins.
    const first = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 3,
      height: 1,
      zIndex: 0,
    })
    appendChildNode(first, txt('111'))
    const second = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 3,
      height: 1,
    })
    appendChildNode(second, txt('222'))

    const root = buildRow(5, 1, first, second)
    const screen = render(root, 5, 1)
    expect(rowText(screen, 0)).toBe('222')
  })

  it('negative zIndex paints UNDER in-flow siblings', () => {
    // Backdrop pattern: the absolute box has z<0, so it paints first,
    // then the in-flow text paints over it. Useful for full-viewport
    // background overlays that don't obscure content.
    const backdrop = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 5,
      height: 1,
      zIndex: -1,
    })
    appendChildNode(backdrop, txt('xxxxx'))
    const fg = txt('AB')

    const root = buildRow(5, 1, backdrop, fg)
    const screen = render(root, 5, 1)
    // 'AB' from in-flow appears at cols 0-1; backdrop's xxxxx fills the
    // tail (cols 2-4). If the backdrop had won at col 0, we'd see 'x'.
    expect(charAt(screen, 0, 0)).toBe('A')
    expect(charAt(screen, 1, 0)).toBe('B')
    expect(charAt(screen, 2, 0)).toBe('x')
  })

  it('positive zIndex paints OVER an in-flow sibling at the same cell', () => {
    // Mirror image of the backdrop case. Without zIndex, an absolute
    // EARLIER in tree order paints under a later in-flow (see baseline
    // case 5). With zIndex={1}, the absolute escapes that ordering.
    const overlay = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 1,
    })
    appendChildNode(overlay, txt('X'))
    const inflow = txt('I')

    const root = buildRow(5, 1, overlay, inflow)
    const screen = render(root, 5, 1)
    expect(charAt(screen, 0, 0)).toBe('X')
  })

  it('sorts a mix of zIndex values correctly across siblings', () => {
    // Children declared in order: z=3, z=1, z=2.
    // Effective sort: z=1, z=2, z=3 → paint order matches sort →
    // z=3 paints last (on top).
    const a = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 3,
    })
    appendChildNode(a, txt('3'))
    const b = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 1,
    })
    appendChildNode(b, txt('1'))
    const c = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 2,
    })
    appendChildNode(c, txt('2'))

    const root = buildRow(5, 1, a, b, c)
    const screen = render(root, 5, 1)
    expect(charAt(screen, 0, 0)).toBe('3')
  })

  it('equal-zIndex siblings preserve DOM order (stable sort)', () => {
    // Three absolutes all at z=5, all overlapping the same cell.
    // Tree order: a, b, c. Stable sort means c (last) paints last.
    const mk = (label: string) => {
      const e = el('ink-box', {
        position: 'absolute',
        top: 0,
        left: 0,
        width: 1,
        height: 1,
        zIndex: 5,
      })
      appendChildNode(e, txt(label))
      return e
    }
    const root = buildRow(5, 1, mk('a'), mk('b'), mk('c'))
    const screen = render(root, 5, 1)
    expect(charAt(screen, 0, 0)).toBe('c')
  })

  it('zIndex on a non-absolute node is silently ignored', () => {
    // A relative-positioned (or in-flow) node with zIndex set should
    // behave exactly as if no zIndex were set — render order unchanged.
    // Two in-flow text nodes; the second has zIndex={100} but it doesn't
    // matter because it's not absolute. Tree order still wins for layout.
    const a = txt('AB')
    const b = el('ink-box', { position: 'relative', zIndex: 100, width: 2, height: 1 })
    appendChildNode(b, txt('CD'))

    const root = buildRow(5, 1, a, b)
    const screen = render(root, 5, 1)
    expect(rowText(screen, 0)).toBe('ABCD')
  })

  it('negative zIndex on absolute that overlaps in-flow at same cell', () => {
    // If the in-flow content occupies the cell that the negative-z
    // absolute paints, in-flow wins (paints later in operations because
    // negative z renders first). This is the key "backdrop" semantic.
    const backdropFull = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 5,
      height: 1,
      zIndex: -10,
    })
    appendChildNode(backdropFull, txt('-----'))
    const inflow = txt('Hi')

    const root = buildRow(5, 1, backdropFull, inflow)
    const screen = render(root, 5, 1)
    // 'H' and 'i' from in-flow at cols 0-1; backdrop's '-' shows at the
    // empty tail (cols 2-4).
    expect(charAt(screen, 0, 0)).toBe('H')
    expect(charAt(screen, 1, 0)).toBe('i')
    expect(charAt(screen, 2, 0)).toBe('-')
  })
})

// ── z-index: stacking-context (nested) ───────────────────────────────

describe('renderNodeToOutput — zIndex stacking contexts', () => {
  it('nested z-indexed absolute sorts within parent group, not globally', () => {
    // Build a popup at z=10 containing a child absolute at z=5.
    // Outside the popup, a sibling at z=20 should paint over BOTH the
    // popup AND the popup's z=5 child. The child's z=5 cannot escape
    // the popup's stacking context (z=10) — it's painted as part of
    // the popup group.
    //
    // Visual: 5 cells wide.
    //   col 0: popup paints '@', then popup's child at z=5 paints '*'
    //          over it (within the popup group). Then sibling at z=20
    //          paints '!' over the whole popup group. Result: '!'.
    const popupChild = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 5,
    })
    appendChildNode(popupChild, txt('*'))

    const popup = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 10,
    })
    appendChildNode(popup, txt('@'))
    appendChildNode(popup, popupChild)

    const sibling = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 20,
    })
    appendChildNode(sibling, txt('!'))

    const root = buildRow(5, 1, popup, sibling)
    const screen = render(root, 5, 1)
    // sibling z=20 wins over the entire popup-and-child group at z=10
    expect(charAt(screen, 0, 0)).toBe('!')
  })

  it('within a stacking context, nested z-indexes still order correctly', () => {
    // No outside competition — the popup's two internal absolutes
    // sort within the popup. inner1 at z=1, inner2 at z=2 → inner2
    // paints over inner1 even though inner1 comes later in tree.
    const inner2 = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 2,
    })
    appendChildNode(inner2, txt('B'))
    const inner1 = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 1,
    })
    appendChildNode(inner1, txt('A'))

    const popup = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 10,
    })
    appendChildNode(popup, inner2) // declared first in tree
    appendChildNode(popup, inner1) // declared second

    const root = buildRow(5, 1, popup)
    const screen = render(root, 5, 1)
    // inner2 (z=2) > inner1 (z=1), so inner2's 'B' wins
    expect(charAt(screen, 0, 0)).toBe('B')
  })

  it('a zero-z absolute does NOT establish an isolated stacking context', () => {
    // zIndex undefined or 0: no context formed. A nested z=10 absolute
    // inside a z=undefined absolute paints in tree order alongside its
    // ancestors' siblings — same as the no-zIndex case for the parent.
    //
    // Setup: an absolute container (no zIndex) holds an inner z=10
    // absolute. A SIBLING absolute outside (also no zIndex, but later
    // in tree) overlaps the same cell.
    //
    // Without stacking context formation: the inner z=10 still sorts
    // among ALL siblings of the container — it would win over the
    // sibling. But our model: the inner is sorted within its parent
    // (the no-z container), and the container's z=0 effective puts it
    // BEFORE the sibling in tree order. Sibling paints last.
    //
    // This test pins the behavior: the inner z=10 cannot reach
    // siblings outside its parent's children list. The implementation's
    // stacking semantics emerge from "siblings sort among themselves
    // within renderChildren" — that's group isolation by recursion.
    const inner = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
      zIndex: 10,
    })
    appendChildNode(inner, txt('I'))
    const container = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
    })
    appendChildNode(container, inner)

    const sibling = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 1,
      height: 1,
    })
    appendChildNode(sibling, txt('S'))

    const root = buildRow(5, 1, container, sibling)
    const screen = render(root, 5, 1)
    // sibling comes after container in tree, both at z=0 → sibling wins
    expect(charAt(screen, 0, 0)).toBe('S')
  })
})
