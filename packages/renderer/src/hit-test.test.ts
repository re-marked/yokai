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
