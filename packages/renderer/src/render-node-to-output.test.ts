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

/**
 * Two-frame render: render once, mutate, re-layout, render again with
 * the first frame's screen as prevScreen. Returns the final frame's
 * screen so tests can verify what got painted across the transition.
 *
 * This exercises the same blit-and-clear path the real renderer uses
 * — the bug being investigated only manifests when an absolute node
 * MOVES between two frames, so a single render() can't reproduce it.
 */
function render2Frames(
  root: DOMElement,
  width: number,
  height: number,
  mutate: () => void,
): Screen {
  const stylePool = new StylePool()
  const charPool = new CharPool()
  const hyperlinkPool = new HyperlinkPool()
  const screenA = createScreen(width, height, stylePool, charPool, hyperlinkPool)
  const screenB = createScreen(width, height, stylePool, charPool, hyperlinkPool)
  const output = new Output({ width, height, stylePool, screen: screenA })

  // Frame 1
  renderNodeToOutput(root, output, { prevScreen: undefined })
  const frameA = output.get()

  // Mutate (e.g. change an absolute node's position) and re-layout
  mutate()
  root.yogaNode!.calculateLayout(width, height)

  // Frame 2 — fresh Output instance into screenB, with frameA as prev
  output.reset(width, height, screenB)
  renderNodeToOutput(root, output, { prevScreen: frameA })
  return output.get()
}

/**
 * Multi-frame render: simulate a drag-style sequence of mutations.
 * Each step alternates back/front buffers like the real renderer
 * (prev = whatever was just rendered last frame).
 */
function renderNFrames(
  root: DOMElement,
  width: number,
  height: number,
  mutations: Array<() => void>,
): Screen {
  const stylePool = new StylePool()
  const charPool = new CharPool()
  const hyperlinkPool = new HyperlinkPool()
  const screens = [
    createScreen(width, height, stylePool, charPool, hyperlinkPool),
    createScreen(width, height, stylePool, charPool, hyperlinkPool),
  ]
  const output = new Output({ width, height, stylePool, screen: screens[0]! })

  // Initial render
  renderNodeToOutput(root, output, { prevScreen: undefined })
  let prevScreen = output.get()

  // Subsequent renders
  for (let i = 0; i < mutations.length; i++) {
    mutations[i]!()
    root.yogaNode!.calculateLayout(width, height)
    const targetScreen = screens[(i + 1) % 2]!
    output.reset(width, height, targetScreen)
    renderNodeToOutput(root, output, { prevScreen })
    prevScreen = output.get()
  }
  return prevScreen
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

// ── multi-frame: position changes on absolute nodes ──────────────────

describe('renderNodeToOutput — absolute node moving between frames', () => {
  it('clears the old position when an absolute node moves right', () => {
    // Reproduces the drag-trail bug. Frame 1: 'XXXXX' at cols 0-4
    // (absolute, on top of in-flow 'hi' at cols 0-1). Frame 2: same
    // overlay moved to cols 10-14. After the move, cells 0-4 must
    // reveal the in-flow 'hi' (cols 0-1) and be empty (cols 2-4).
    // If old paint persists at cols 0-4, that's the trail bug.
    const overlay = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 5,
      height: 1,
    })
    appendChildNode(overlay, txt('XXXXX'))
    const root = buildRow(20, 1, txt('hi'), overlay)

    const frame2 = render2Frames(root, 20, 1, () => {
      setStyle(overlay, { ...overlay.style, left: 10 })
      applyStyles(overlay.yogaNode!, { ...overlay.style, left: 10 })
    })

    // Cols 2-4 must NOT have 'X' (overlay moved away). If they show
    // 'X', the old absolute paint wasn't cleared — that's the trail bug.
    expect(charAt(frame2, 2, 0)).not.toBe('X')
    expect(charAt(frame2, 3, 0)).not.toBe('X')
    expect(charAt(frame2, 4, 0)).not.toBe('X')
    // New position (cols 10-14): the moved overlay
    expect(charAt(frame2, 10, 0)).toBe('X')
    expect(charAt(frame2, 14, 0)).toBe('X')
  })

  it('does NOT leak stale paint via partially-overlapping clean sibling blit', () => {
    // Reproduces the drag-trail bug from the demo: when a moving
    // absolute (A) and a stationary clean absolute sibling (B)
    // PARTIALLY overlap, B's clean-blit fast path copies prev[B's rect]
    // — which includes A's old paint at the overlap. The current
    // absoluteClears suppression only fires on FULL containment, so
    // partial overlaps leak A's stale border into the new frame.
    //
    // Setup: A at cols 0-9, B at cols 5-14 (overlap 5-9). A on top
    // in prev (later in tree). Frame 2: A moves to cols 20-29.
    // B stays put (clean), blits cols 5-14 from prev.
    // At cells 5-9 (the overlap): prev had A's paint, B's blit
    // copies it into current. Trail.
    const a = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 10,
      height: 1,
    })
    appendChildNode(a, txt('AAAAAAAAAA'))
    const b = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 5,
      width: 10,
      height: 1,
    })
    appendChildNode(b, txt('BBBBBBBBBB'))
    const root = el('ink-root', { width: 40, height: 1, flexDirection: 'row' })
    appendChildNode(root, a)
    appendChildNode(root, b)
    root.yogaNode!.calculateLayout(40, 1)

    const frame2 = render2Frames(root, 40, 1, () => {
      setStyle(a, { ...a.style, left: 20 })
      applyStyles(a.yogaNode!, { ...a.style, left: 20 })
    })

    // Cells 0-4: A used to be here, now empty. No clean sibling rect
    // covers them, so no blit can leak old A paint.
    expect(charAt(frame2, 0, 0)).not.toBe('A')
    expect(charAt(frame2, 4, 0)).not.toBe('A')
    // Cells 5-9: the OVERLAP. B's clean blit covers them. prev[5..9]
    // had A's paint (A on top in prev). If B's blit copies A's old
    // paint into the new frame, this assertion FAILS — that's the
    // trail bug.
    expect(charAt(frame2, 5, 0)).toBe('B')
    expect(charAt(frame2, 9, 0)).toBe('B')
    // Cells 10-14: only B's territory, fine
    expect(charAt(frame2, 10, 0)).toBe('B')
    // Cells 20-29: A's new position
    expect(charAt(frame2, 20, 0)).toBe('A')
    expect(charAt(frame2, 29, 0)).toBe('A')
  })

  it('clears old border cells when a bordered absolute box moves (drag-trail repro)', () => {
    // Mirrors the drag demo's structure exactly. Three absolute boxes
    // with borderStyle. Box A has cells that are ONLY covered by its
    // own border in prev (the top border row, where no sibling reaches).
    // After A moves, those cells should clear to empty.
    function mkBox(label: string, top: number, left: number): DOMElement {
      const b = el('ink-box', {
        position: 'absolute',
        top,
        left,
        width: 20,
        height: 3,
        zIndex: 10,
        borderStyle: 'single',
      })
      const inner = el('ink-box', { paddingX: 1, flexGrow: 1 })
      appendChildNode(inner, txt(label))
      appendChildNode(b, inner)
      return b
    }

    const a = mkBox('aaaaaaaaaaaaa', 6, 4)
    const b = mkBox('bbbbbbbbbbbbb', 7, 8)
    const c = mkBox('ccccccccccccc', 8, 12)

    const root = el('ink-root', { width: 60, height: 12, flexDirection: 'column' })
    appendChildNode(root, a)
    appendChildNode(root, b)
    appendChildNode(root, c)
    root.yogaNode!.calculateLayout(60, 12)

    const frame2 = render2Frames(root, 60, 12, () => {
      // Move A right by 20 cells (out of overlap with b and c)
      setStyle(a, { ...a.style, left: 30 })
      applyStyles(a.yogaNode!, { ...a.style, left: 30 })
    })

    // A's old top border was at (cols 4..23, row 6). No sibling reaches
    // row 6 (b is rows 7..9, c is rows 8..10). So in prev, row 6 had
    // ONLY A's top border. After A moves, row 6 cells should be empty.
    // If they're not, A's top border wasn't cleared — the trail bug.
    for (let col = 4; col <= 23; col++) {
      const ch = charAt(frame2, col, 6)
      // Border characters are box-drawing glyphs (─, │, ┌, ┐, └, ┘).
      // Empty cells are ' ' or empty string.
      expect(
        ch === '' || ch === ' ',
        `expected empty cell at (${col}, 6) but got '${ch}' (A's old top border leaked)`,
      ).toBe(true)
    }
  })

  it('does not accumulate trail across many small drag motions (drag-trail repro N-frame)', () => {
    // Same setup as the previous test, but simulate an actual DRAG:
    // many small position deltas, one per frame, like onMove fires.
    function mkBox(label: string, top: number, left: number): DOMElement {
      const e = el('ink-box', {
        position: 'absolute',
        top,
        left,
        width: 20,
        height: 3,
        zIndex: 10,
        borderStyle: 'single',
      })
      const inner = el('ink-box', { paddingX: 1, flexGrow: 1 })
      appendChildNode(inner, txt(label))
      appendChildNode(e, inner)
      return e
    }

    const a = mkBox('aaa', 6, 4)
    const b = mkBox('bbb', 7, 8)
    const c = mkBox('ccc', 8, 12)
    const root = el('ink-root', { width: 80, height: 12, flexDirection: 'column' })
    appendChildNode(root, a)
    appendChildNode(root, b)
    appendChildNode(root, c)
    root.yogaNode!.calculateLayout(80, 12)

    // Simulate dragging A right by 1 cell per frame, 30 frames.
    const mutations = Array.from({ length: 30 }, (_, i) => () => {
      const newLeft = 5 + i // 5, 6, 7, ..., 34
      setStyle(a, { ...a.style, left: newLeft })
      applyStyles(a.yogaNode!, { ...a.style, left: newLeft })
    })

    const finalScreen = renderNFrames(root, 80, 12, mutations)

    // After 30 frames of 1-cell drags, A is at left=34 (rect 34..53,
    // rows 6..8). A's old positions (lefts 4-33) are TRAIL territory
    // — the bug would show A's old paint left over.
    //
    // Specifically: A's TOP BORDER ROW (row 6) was only ever painted
    // by A (no sibling reaches row 6). So row 6 cells outside A's
    // current rect (cols 0..33 and cols 54..79) should be EMPTY.
    for (let col = 0; col < 34; col++) {
      const ch = charAt(finalScreen, col, 6)
      expect(ch === '' || ch === ' ', `trail at (${col}, 6): got '${ch}', expected empty`).toBe(
        true,
      )
    }
  })

  it('clean sibling stays fully painted when an overlapping absolute moves away (notch repro)', () => {
    // Reproduces the "notches" bug from the drag demo: when A overlaps
    // B in prev (A on top, last in tree), then A moves away, B's blit
    // path would normally copy prev[B's rect] — which has A's old
    // paint at the overlap. Per-cell suppression (the previous fix)
    // hides that stale paint by zeroing those cells, but then B has
    // empty cells where its paint should be — visible as missing
    // chunks / notches.
    //
    // Fix: clean absolutes whose rect overlaps any moving sibling's
    // OLD rect must re-render fully (not blit), so they paint their
    // own content into the overlap cells.
    const a = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 10,
      height: 1,
    })
    appendChildNode(a, txt('AAAAAAAAAA'))
    const b = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 5,
      width: 10,
      height: 1,
    })
    appendChildNode(b, txt('BBBBBBBBBB'))
    const root = el('ink-root', { width: 30, height: 1, flexDirection: 'row' })
    appendChildNode(root, a)
    appendChildNode(root, b)
    root.yogaNode!.calculateLayout(30, 1)

    const frame2 = render2Frames(root, 30, 1, () => {
      // Move A right, out of overlap with B
      setStyle(a, { ...a.style, left: 20 })
      applyStyles(a.yogaNode!, { ...a.style, left: 20 })
    })

    // B is at cols 5-14. ALL those cells should have 'B' — even the
    // overlap region (cols 5-9) where A used to be on top in prev.
    // Without the fix: cols 5-9 have empty cells (notch), cols 10-14
    // have 'B' from B's own non-overlap area.
    for (let col = 5; col <= 14; col++) {
      expect(charAt(frame2, col, 0)).toBe('B')
    }
    // A's old non-overlap cells (cols 0-4) should be empty
    for (let col = 0; col <= 4; col++) {
      expect(charAt(frame2, col, 0)).not.toBe('A')
    }
    // A's new position (cols 20-29)
    expect(charAt(frame2, 20, 0)).toBe('A')
    expect(charAt(frame2, 29, 0)).toBe('A')
  })

  it('clean IN-FLOW sibling stays fully painted when overlapping absolute moves away', () => {
    // Same notch class of bug, but the underneath sibling is an in-flow
    // text element instead of another absolute. The drag demo has the
    // header text and the draggable boxes as siblings inside the same
    // column container — dragging a box over the text and back left
    // chunks of the text empty.
    //
    // The fix must apply to ANY clean child overlapping a moving
    // absolute's old rect, not just clean absolute siblings.
    const text = txt('hello world')
    const overlay = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 3,
      width: 5,
      height: 1,
    })
    appendChildNode(overlay, txt('XXXXX'))
    const root = el('ink-root', { width: 30, height: 1, flexDirection: 'row' })
    appendChildNode(root, text)
    appendChildNode(root, overlay)
    root.yogaNode!.calculateLayout(30, 1)

    const frame2 = render2Frames(root, 30, 1, () => {
      // Move the overlay out of the text's row entirely
      setStyle(overlay, { ...overlay.style, left: 20 })
      applyStyles(overlay.yogaNode!, { ...overlay.style, left: 20 })
    })

    // 'hello world' = 11 chars at cols 0-10. Without the fix, cols 3-7
    // (where the overlay used to sit on top in prev) get zeroed by the
    // per-cell suppression and stay empty.
    expect(charAt(frame2, 0, 0)).toBe('h')
    expect(charAt(frame2, 1, 0)).toBe('e')
    expect(charAt(frame2, 2, 0)).toBe('l')
    expect(charAt(frame2, 3, 0)).toBe('l') // overlap cell, must NOT be empty
    expect(charAt(frame2, 4, 0)).toBe('o')
    expect(charAt(frame2, 5, 0)).toBe(' ')
    expect(charAt(frame2, 6, 0)).toBe('w')
    expect(charAt(frame2, 7, 0)).toBe('o') // last overlap cell
    expect(charAt(frame2, 8, 0)).toBe('r')
    expect(charAt(frame2, 9, 0)).toBe('l')
    expect(charAt(frame2, 10, 0)).toBe('d')
    // Overlay's new position
    expect(charAt(frame2, 20, 0)).toBe('X')
    expect(charAt(frame2, 24, 0)).toBe('X')
  })

  it('clears the old position when an absolute node moves down', () => {
    // Same bug, vertical axis. Two-row viewport, overlay starts at
    // row 0, moves to row 1.
    const overlay = el('ink-box', {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 3,
      height: 1,
    })
    appendChildNode(overlay, txt('YYY'))
    const root = el('ink-root', { width: 5, height: 2, flexDirection: 'column' })
    appendChildNode(root, overlay)
    root.yogaNode!.calculateLayout(5, 2)

    const frame2 = render2Frames(root, 5, 2, () => {
      setStyle(overlay, { ...overlay.style, top: 1 })
      applyStyles(overlay.yogaNode!, { ...overlay.style, top: 1 })
    })

    // Row 0 (old position) should be empty
    expect(charAt(frame2, 0, 0)).not.toBe('Y')
    expect(charAt(frame2, 1, 0)).not.toBe('Y')
    expect(charAt(frame2, 2, 0)).not.toBe('Y')
    // Row 1 (new position) should have the overlay
    expect(charAt(frame2, 0, 1)).toBe('Y')
    expect(charAt(frame2, 1, 1)).toBe('Y')
    expect(charAt(frame2, 2, 1)).toBe('Y')
  })

  it('clean cousin of a moving absolute is repainted (cross-subtree notch repro)', () => {
    // Reproduces the constrained-drag demo notch bug Mark observed:
    //   Outer
    //     ├─ text  (in-flow, rendered first)
    //     └─ container (absolute, with bg)
    //          └─ overlay (absolute, dragged this frame)
    //
    // The overlay clears its OLD rect with fromAbsolute=true, which adds
    // that rect to absoluteClears (output.ts) — global, suppresses ANY
    // blit covering those cells. If the overlay's old rect lies on a row
    // shared with the in-flow text, the text's clean-blit at the outer
    // renderChildren level gets per-cell suppressed there → cells go
    // empty → notches in the text.
    //
    // The pre-fix overlap-rerender check at the outer level only looked
    // at the container's cached rect (the only DIRECT dirty absolute
    // sibling of the text). The overlay's rect, being a descendant, was
    // invisible there, so the text wasn't forced to re-render.
    //
    // Fix: collect EVERY dirty absolute's cached rect tree-wide and use
    // that for the overlap check at every level.
    // Text on row 0. Container absolute on row 3 (does NOT overlap text).
    // Overlay nested in container with negative top so its screen y lands
    // back on row 0 (the text's row). Critical: at the root level, the
    // only dirty absolute that's a direct child is the container, whose
    // rect is at row 3 — does NOT overlap text. Without tree-wide
    // collection, the text isn't forced to re-render and its blit cells
    // get zeroed by the overlay's clear (in absoluteClears).
    const text = txt('hello world hello world')
    const overlay = el('ink-box', {
      position: 'absolute',
      top: -3, // container at row 3, overlay at -3 → screen row 0
      left: 5,
      width: 6,
      height: 1,
      backgroundColor: 'cyan',
    })
    const container = el('ink-box', {
      position: 'absolute',
      top: 3,
      left: 0,
      width: 30,
      height: 1,
    })
    appendChildNode(container, overlay)

    const root = el('ink-root', { width: 30, height: 4, flexDirection: 'column' })
    appendChildNode(root, text)
    appendChildNode(root, container)
    root.yogaNode!.calculateLayout(30, 4)

    const frame2 = render2Frames(root, 30, 4, () => {
      // Move overlay sideways so it's no longer at cols 5..10 of row 0
      setStyle(overlay, { ...overlay.style, left: 20 })
      applyStyles(overlay.yogaNode!, { ...overlay.style, left: 20 })
    })

    // Cells (5..10, row 0) had the overlay in prev. The overlay moved
    // away → text should be visible there. Without the tree-wide fix,
    // those cells stay empty (per-cell suppression zeroed text's blit
    // and nothing forced text to re-render).
    expect(charAt(frame2, 5, 0)).toBe(' ')
    expect(charAt(frame2, 6, 0)).toBe('w')
    expect(charAt(frame2, 7, 0)).toBe('o')
    expect(charAt(frame2, 8, 0)).toBe('r')
    expect(charAt(frame2, 9, 0)).toBe('l')
    expect(charAt(frame2, 10, 0)).toBe('d')
    // Text still intact at non-overlap cells
    expect(charAt(frame2, 0, 0)).toBe('h')
    expect(charAt(frame2, 4, 0)).toBe('o')
  })
})
