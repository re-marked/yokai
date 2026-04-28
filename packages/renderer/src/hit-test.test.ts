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
import {
  type DOMElement,
  appendChildNode,
  createNode,
  setAttribute,
} from './dom.js'
import { FocusManager } from './focus.js'
import { dispatchClick } from './hit-test.js'
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
