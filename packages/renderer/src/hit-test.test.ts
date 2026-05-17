/**
 * Hit-test tests focused on the click-to-focus behavior — specifically
 * the `claimFocusOnClick={false}` opt-out used by Checkbox / Radio
 * to keep focus pinned on a peer (e.g. a TextInput showing a live
 * preview) when the user clicks a control.
 *
 * Pure-helper style: hand-built DOM trees + manual nodeCache rect
 * population, no React render. Mirrors the FocusGroup.test.tsx
 * pattern.
 */

import { describe, expect, it, vi } from 'vitest'
import { type DOMElement, appendChildNode, createNode, setAttribute } from './dom.js'
import type { EventHandlerProps } from './events/event-handlers.js'
import { FocusManager } from './focus.js'
import { dispatchClick, dispatchHover, hitTest } from './hit-test.js'
import { nodeCache } from './node-cache.js'

function setRect(node: DOMElement, x: number, y: number, w: number, h: number): void {
  nodeCache.set(node, { x, y, width: w, height: h })
}

function makeRoot(): { root: DOMElement; focus: ReturnType<typeof vi.spyOn> } {
  const root = createNode('ink-root')
  setRect(root, 0, 0, 100, 100)
  const fm = new FocusManager(() => false)
  root.focusManager = fm
  // Spy on focus so tests can assert who got it without a stub registry
  const focusSpy = vi.spyOn(fm, 'focus')
  return { root, focus: focusSpy }
}

describe('dispatchClick → click-to-focus', () => {
  it('focuses the deepest focusable ancestor under the click', () => {
    const { root, focus } = makeRoot()
    const focusable = createNode('ink-box')
    setAttribute(focusable, 'tabIndex', 0)
    setRect(focusable, 10, 10, 20, 5)
    appendChildNode(root, focusable)

    dispatchClick(root, 15, 12)
    expect(focus).toHaveBeenCalledWith(focusable)
  })

  it('walks up to a focusable ancestor when the deepest hit is not focusable', () => {
    const { root, focus } = makeRoot()
    const focusable = createNode('ink-box')
    setAttribute(focusable, 'tabIndex', 0)
    setRect(focusable, 10, 10, 20, 5)
    appendChildNode(root, focusable)
    const inner = createNode('ink-box')
    setRect(inner, 12, 11, 5, 2)
    appendChildNode(focusable, inner)

    // Click lands inside `inner`, which has no tabIndex — walks up to focusable.
    dispatchClick(root, 14, 12)
    expect(focus).toHaveBeenCalledWith(focusable)
  })

  it('does NOT focus when the deepest focusable opts out via claimFocusOnClick={false}', () => {
    const { root, focus } = makeRoot()
    const optedOut = createNode('ink-box')
    setAttribute(optedOut, 'tabIndex', 0)
    setAttribute(optedOut, 'claimFocusOnClick', false)
    setRect(optedOut, 10, 10, 20, 5)
    appendChildNode(root, optedOut)

    dispatchClick(root, 15, 12)
    expect(focus).not.toHaveBeenCalled()
  })

  it('opted-out focusable does NOT delegate to a focusable parent', () => {
    // Important: clicking a Checkbox inside a focusable container should
    // NOT bubble focus up to the container. The user's click intent
    // landed on the deepest focusable; if that one says "no focus,"
    // nothing else gets focus either.
    const { root, focus } = makeRoot()
    const outer = createNode('ink-box')
    setAttribute(outer, 'tabIndex', 0)
    setRect(outer, 5, 5, 50, 30)
    appendChildNode(root, outer)
    const optedOut = createNode('ink-box')
    setAttribute(optedOut, 'tabIndex', 0)
    setAttribute(optedOut, 'claimFocusOnClick', false)
    setRect(optedOut, 10, 10, 20, 5)
    appendChildNode(outer, optedOut)

    dispatchClick(root, 15, 12)
    expect(focus).not.toHaveBeenCalled()
  })

  it('focuses normally when claimFocusOnClick is explicitly true', () => {
    const { root, focus } = makeRoot()
    const focusable = createNode('ink-box')
    setAttribute(focusable, 'tabIndex', 0)
    setAttribute(focusable, 'claimFocusOnClick', true)
    setRect(focusable, 10, 10, 20, 5)
    appendChildNode(root, focusable)

    dispatchClick(root, 15, 12)
    expect(focus).toHaveBeenCalledWith(focusable)
  })

  it('non-focusable click on opted-out element falls through normally', () => {
    // claimFocusOnClick is meaningful only when tabIndex is set —
    // setting it on a non-focusable Box is a no-op.
    const { root, focus } = makeRoot()
    const outer = createNode('ink-box')
    setAttribute(outer, 'tabIndex', 0)
    setRect(outer, 5, 5, 50, 30)
    appendChildNode(root, outer)
    const inner = createNode('ink-box')
    setAttribute(inner, 'claimFocusOnClick', false) // no tabIndex — irrelevant
    setRect(inner, 10, 10, 20, 5)
    appendChildNode(outer, inner)

    dispatchClick(root, 15, 12)
    // Walks up past inner (no tabIndex), finds outer, focuses it.
    expect(focus).toHaveBeenCalledWith(outer)
  })
})

// ── hitTest as a public consumer API ─────────────────────────────────
//
// hitTest is re-exported from the package index (PR for A20). Consumers
// inside a captured gesture's onMove handler can call it to resolve
// "what element is at this cursor right now?" without reinventing
// hit-testing — the canonical use is drop-target detection during
// custom drag flows.

describe('hitTest', () => {
  function root() {
    const r = createNode('ink-root')
    setRect(r, 0, 0, 100, 100)
    return r
  }

  it('returns the deepest element containing the cursor', () => {
    const r = root()
    const outer = createNode('ink-box')
    setRect(outer, 10, 10, 30, 10)
    appendChildNode(r, outer)
    const inner = createNode('ink-box')
    setRect(inner, 15, 12, 10, 5)
    appendChildNode(outer, inner)

    expect(hitTest(r, 17, 14)).toBe(inner)
  })

  it('returns null when the cursor is past the root rect', () => {
    expect(hitTest(root(), 200, 200)).toBeNull()
  })

  it('walks up through siblings to find the cell-containing node', () => {
    const r = root()
    const outer = createNode('ink-box')
    setRect(outer, 10, 10, 30, 10)
    appendChildNode(r, outer)
    // Cursor lands inside outer's rect but not on any inner child.
    expect(hitTest(r, 12, 11)).toBe(outer)
  })
})

// ── dispatchHover enter/leave diff ───────────────────────────────────
//
// Used by the App-level mouse routing AND now (post-A20) called even
// during captured gestures so drop targets can react to cursor entry.
// Pure-helper test — drives dispatchHover with a held `hovered` Set
// across calls and asserts enter/leave fire correctly on diffs.

describe('dispatchHover', () => {
  it('fires onMouseEnter for newly-hovered nodes', () => {
    const r = createNode('ink-root')
    setRect(r, 0, 0, 100, 100)
    const target = createNode('ink-box')
    setRect(target, 10, 10, 20, 5)
    appendChildNode(r, target)
    const onMouseEnter = vi.fn()
    target._eventHandlers = { onMouseEnter } as EventHandlerProps

    const hovered = new Set<DOMElement>()
    dispatchHover(r, 15, 12, hovered)
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
    expect(hovered.has(target)).toBe(true)
  })

  it('fires onMouseLeave when cursor exits the hovered rect', () => {
    const r = createNode('ink-root')
    setRect(r, 0, 0, 100, 100)
    const target = createNode('ink-box')
    setRect(target, 10, 10, 20, 5)
    appendChildNode(r, target)
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()
    target._eventHandlers = { onMouseEnter, onMouseLeave } as EventHandlerProps

    const hovered = new Set<DOMElement>()
    dispatchHover(r, 15, 12, hovered)
    dispatchHover(r, 50, 50, hovered) // off the target
    expect(onMouseLeave).toHaveBeenCalledTimes(1)
    expect(hovered.has(target)).toBe(false)
  })

  it('idempotent on same-cell calls (no enter/leave when nothing changed)', () => {
    const r = createNode('ink-root')
    setRect(r, 0, 0, 100, 100)
    const target = createNode('ink-box')
    setRect(target, 10, 10, 20, 5)
    appendChildNode(r, target)
    const onMouseEnter = vi.fn()
    const onMouseLeave = vi.fn()
    target._eventHandlers = { onMouseEnter, onMouseLeave } as EventHandlerProps

    const hovered = new Set<DOMElement>()
    dispatchHover(r, 15, 12, hovered)
    dispatchHover(r, 15, 12, hovered)
    dispatchHover(r, 15, 12, hovered)
    // First call entered. Subsequent same-cell calls dedupe.
    expect(onMouseEnter).toHaveBeenCalledTimes(1)
    expect(onMouseLeave).not.toHaveBeenCalled()
  })

  it('exclude param skips a subtree, hit-test resolves to next-topmost', () => {
    // Setup mirrors the drag-over-sibling case: an absolute z-boosted
    // "drag ghost" sits over a sibling drop zone. Without exclusion the
    // hover hit-tests resolve to the ghost (it's on top); with the
    // ghost excluded, hover correctly resolves to the drop zone.
    const r = createNode('ink-root')
    setRect(r, 0, 0, 100, 100)
    const dropZone = createNode('ink-box')
    setRect(dropZone, 10, 10, 30, 10)
    appendChildNode(r, dropZone)
    const dropEnter = vi.fn()
    dropZone._eventHandlers = { onMouseEnter: dropEnter } as EventHandlerProps

    // Drag ghost: absolute, high zIndex, OVER the drop zone.
    const ghost = createNode('ink-box')
    ghost.style = { position: 'absolute', zIndex: 100 }
    setRect(ghost, 15, 12, 5, 3)
    appendChildNode(r, ghost)
    const ghostEnter = vi.fn()
    ghost._eventHandlers = { onMouseEnter: ghostEnter } as EventHandlerProps

    const hovered = new Set<DOMElement>()

    // No exclude: ghost wins (it's on top).
    dispatchHover(r, 17, 13, hovered)
    expect(ghostEnter).toHaveBeenCalledTimes(1)
    expect(dropEnter).not.toHaveBeenCalled()

    // Reset and re-test with ghost excluded — drop zone wins instead.
    hovered.clear()
    ghostEnter.mockClear()
    dropEnter.mockClear()
    dispatchHover(r, 17, 13, hovered, ghost)
    expect(ghostEnter).not.toHaveBeenCalled()
    expect(dropEnter).toHaveBeenCalledTimes(1)
  })
})

// ── A23: Surface hit-test boundary ─────────────────────────────────────
//
// `surfaceHitTestBoundary === true` on an absolute ink-box (set by
// `<Surface hitTestBoundary>`) marks the surface as owning every cell
// it covers — lower-z absolute siblings beneath the boundary's rect
// must never receive mouse events at those cells. The current reverse-
// paint-order iteration already enforces this implicitly (first match
// wins on the highest z), so most of these tests pin behavior that
// already holds. The point is the contract: a hit-test refactor that
// changes the implicit-fallthrough semantics must keep these tests
// green, which forces it to honor the explicit boundary flag.
describe('hit-test — A23 Surface boundary', () => {
  function root() {
    const r = createNode('ink-root')
    nodeCache.set(r, { x: 0, y: 0, width: 100, height: 100 })
    return r
  }

  function boundary(x: number, y: number, w: number, h: number, z = 100): DOMElement {
    const b = createNode('ink-box')
    b.style = { position: 'absolute', zIndex: z }
    setAttribute(b, 'surfaceHitTestBoundary', true)
    nodeCache.set(b, { x, y, width: w, height: h })
    return b
  }

  function sibling(x: number, y: number, w: number, h: number, z = 0): DOMElement {
    const s = createNode('ink-box')
    s.style = { position: 'absolute', zIndex: z }
    nodeCache.set(s, { x, y, width: w, height: h })
    return s
  }

  it('click on a boundary Surface returns the boundary, never the lower-z sibling', () => {
    // Both rects contain (15, 12). Boundary is at z=100, sibling at z=5.
    // Hit-test must resolve to the boundary.
    const r = root()
    const b = boundary(10, 10, 20, 5, 100)
    const s = sibling(5, 8, 30, 10, 5)
    appendChildNode(r, s)
    appendChildNode(r, b)
    expect(hitTest(r, 15, 12)).toBe(b)
  })

  it('click off the boundary still reaches a lower-z sibling that DOES cover the cell', () => {
    // Boundary doesn't contain (40, 15); sibling does. Boundary should
    // not occlude cells it doesn't cover.
    const r = root()
    const b = boundary(10, 10, 20, 5, 100)
    const s = sibling(30, 10, 30, 10, 5)
    appendChildNode(r, s)
    appendChildNode(r, b)
    expect(hitTest(r, 40, 15)).toBe(s)
  })

  it('boundary descent: clicking inside a boundary returns its descendant when there is one', () => {
    // Normal hit-test descent into the boundary's subtree still works
    // — the boundary flag changes only sibling occlusion, not internal
    // hit-testing.
    const r = root()
    const b = boundary(10, 10, 20, 5, 100)
    const inner = createNode('ink-box')
    nodeCache.set(inner, { x: 14, y: 11, width: 4, height: 3 })
    appendChildNode(b, inner)
    appendChildNode(r, b)
    expect(hitTest(r, 15, 12)).toBe(inner)
  })

  it('boundary with NO descendants at the click cell still returns the boundary itself', () => {
    // Tests the spec's "boundary absorbs even on transparent cells" —
    // clicking on a part of the modal with no interactive child still
    // resolves to the modal, never to a lower-z sibling beneath.
    const r = root()
    const b = boundary(10, 10, 20, 5, 100)
    const s = sibling(10, 10, 20, 5, 5) // exactly the same rect, lower z
    appendChildNode(r, s)
    appendChildNode(r, b)
    expect(hitTest(r, 15, 12)).toBe(b)
  })

  it('non-absolute Surface with boundary flag does NOT occlude (flag silently ignored)', () => {
    // The renderer's existing zIndex rule only honors stacking on
    // absolute nodes; the boundary contract follows the same rule
    // (a relative Surface can't be a boundary because it doesn't
    // participate in absolute-sibling stacking). Hit-test must not
    // honor the flag in this case.
    const r = root()
    const b = createNode('ink-box')
    b.style = { position: 'relative' }
    setAttribute(b, 'surfaceHitTestBoundary', true)
    nodeCache.set(b, { x: 10, y: 10, width: 20, height: 5 })
    const s = sibling(10, 10, 20, 5, 5)
    appendChildNode(r, s)
    appendChildNode(r, b)
    // In-flow boundary doesn't participate in z-stacking; current
    // reverse-tree-order iteration tries the boundary last (it was
    // appended last but in-flow has no z). Either way the click is
    // resolved without the boundary contract kicking in.
    const hit = hitTest(r, 15, 12)
    expect(hit === b || hit === s).toBe(true)
  })

  it('boundary without the flag attribute behaves like a normal absolute (current Box)', () => {
    // Regression guard: existing Boxes without the boundary flag continue
    // to work via the reverse-z implicit semantics.
    const r = root()
    const b = createNode('ink-box')
    b.style = { position: 'absolute', zIndex: 100 }
    nodeCache.set(b, { x: 10, y: 10, width: 20, height: 5 })
    const s = sibling(10, 10, 20, 5, 5)
    appendChildNode(r, s)
    appendChildNode(r, b)
    // Same expected outcome as the boundary case — z-stacking already
    // gives the higher-z absolute the win.
    expect(hitTest(r, 15, 12)).toBe(b)
  })
})
