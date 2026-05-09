/**
 * Tests for the cursor z-stacking suppression check applied at finalize
 * time in `ink.tsx`. The check answers: "is the declared cursor cell
 * actually visible to the user, or is something painted on top?"
 *
 * Pure-helper style: hand-built DOM trees + manual nodeCache rect
 * population. Mirrors `hit-test.test.ts`.
 *
 * The motivating bug (A24, issue #83): a `<TextInput>`'s caret kept
 * rendering through any modal that didn't itself contain a focused
 * input. Cursors are paint primitives and should follow paint order.
 */

import { describe, expect, it } from 'vitest'
import { isCursorVisibleAt, isDescendantOrSelf } from './cursor-visibility.js'
import { type DOMElement, appendChildNode, createNode } from './dom.js'
import { nodeCache } from './node-cache.js'

function setRect(node: DOMElement, x: number, y: number, w: number, h: number): void {
  nodeCache.set(node, { x, y, width: w, height: h })
}

describe('isDescendantOrSelf', () => {
  it('returns true for the same node', () => {
    const n = createNode('ink-box')
    expect(isDescendantOrSelf(n, n)).toBe(true)
  })

  it('returns true for a descendant', () => {
    const ancestor = createNode('ink-box')
    const child = createNode('ink-box')
    appendChildNode(ancestor, child)
    const grandchild = createNode('ink-box')
    appendChildNode(child, grandchild)
    expect(isDescendantOrSelf(grandchild, ancestor)).toBe(true)
  })

  it('returns false for an unrelated subtree', () => {
    const a = createNode('ink-box')
    const b = createNode('ink-box')
    expect(isDescendantOrSelf(a, b)).toBe(false)
  })

  it('returns false when ancestor is below node in the tree', () => {
    // Reversed direction: descendant→ancestor walk does not match
    // ancestor→descendant.
    const ancestor = createNode('ink-box')
    const child = createNode('ink-box')
    appendChildNode(ancestor, child)
    expect(isDescendantOrSelf(ancestor, child)).toBe(false)
  })
})

describe('isCursorVisibleAt', () => {
  it('returns true when the declared cell is on the declared node', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    // Cursor declared at input's caret cell (15, 12) — input owns it.
    expect(isCursorVisibleAt(root, input, 15, 12)).toBe(true)
  })

  it('returns true when the declared cell is on a descendant of the declared node', () => {
    // Common case: declaration attached to a Box that wraps a TextInput;
    // the actual caret cell lands on the inner Text. Both are visually
    // owned by the declared subtree.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const wrapper = createNode('ink-box')
    setRect(wrapper, 10, 10, 30, 5)
    appendChildNode(root, wrapper)
    const innerText = createNode('ink-text')
    setRect(innerText, 12, 11, 20, 1)
    appendChildNode(wrapper, innerText)

    expect(isCursorVisibleAt(root, wrapper, 15, 11)).toBe(true)
  })

  it('returns FALSE when a higher-z modal paints over the declared cell (A24 repro)', () => {
    // Background TextInput-like Box declares the cursor.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    // Modal on top, absolute + zIndex, COVERING the cursor cell.
    const modal = createNode('ink-box')
    modal.style = { position: 'absolute', zIndex: 100 }
    setRect(modal, 5, 5, 50, 20)
    appendChildNode(root, modal)

    // Cursor declared at (15, 12) — inside both rects, but modal paints
    // on top with higher z. Without suppression the cursor would render
    // through the modal frame; with suppression it goes away.
    expect(isCursorVisibleAt(root, input, 15, 12)).toBe(false)
  })

  it('returns true when the modal covers a different cell than the cursor', () => {
    // Negative case: modal exists but doesn't actually cover the cursor
    // cell. Cursor stays visible.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)
    const modal = createNode('ink-box')
    modal.style = { position: 'absolute', zIndex: 100 }
    setRect(modal, 50, 50, 30, 10) // off to the side
    appendChildNode(root, modal)

    expect(isCursorVisibleAt(root, input, 15, 12)).toBe(true)
  })

  it('returns true when the declared cell is inside a focused TextInput inside the modal', () => {
    // Modal on top contains its own focused input. The DECLARED node IS
    // that inner input (its useDeclaredCursor wins last-write-wins).
    // hit-test at the cell returns the inner input → descendant of itself →
    // visible. The bug never manifests because the declared subtree wins.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const bgInput = createNode('ink-box')
    setRect(bgInput, 5, 5, 40, 10)
    appendChildNode(root, bgInput)

    const modal = createNode('ink-box')
    modal.style = { position: 'absolute', zIndex: 100 }
    setRect(modal, 10, 10, 50, 20)
    appendChildNode(root, modal)

    const modalInput = createNode('ink-box')
    setRect(modalInput, 15, 15, 30, 5)
    appendChildNode(modal, modalInput)

    // Cursor declared at modalInput's caret. Modal paints on top with
    // high z, but the inner input is a descendant of the modal — so
    // hit-test at the cell returns the inner input (or modal itself,
    // both descendants of the modal subtree). The declared node is
    // modalInput; hit must be modalInput or a descendant of modalInput.
    expect(isCursorVisibleAt(root, modalInput, 17, 16)).toBe(true)
  })

  it('returns false when the cell is off any rendered element', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    // Cursor declared way outside any rendered rect.
    expect(isCursorVisibleAt(root, input, 200, 200)).toBe(false)
  })

  it('returns true for a sibling that has higher z but DOES NOT cover the cursor cell', () => {
    // Edge: another absolute z=100 sibling exists but its rect doesn't
    // contain the cursor. hit-test must resolve to the declared subtree.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)
    const otherModal = createNode('ink-box')
    otherModal.style = { position: 'absolute', zIndex: 100 }
    setRect(otherModal, 60, 60, 30, 10)
    appendChildNode(root, otherModal)

    expect(isCursorVisibleAt(root, input, 15, 12)).toBe(true)
  })
})
