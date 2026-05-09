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
  // Helpers — the screen-painted predicate is provided by the caller.
  // Tests pass a stub that either reports all cells painted (modal has
  // background / border / text) or all cells empty (transparent layout
  // wrapper).
  const allPainted = () => true
  const allEmpty = () => false
  const paintedAt = (cells: Array<[number, number]>) => (c: number, r: number) =>
    cells.some(([cx, cy]) => cx === c && cy === r)

  it('returns true when the declared cell is on the declared node', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    // Cursor declared at input's caret cell (15, 12) — input owns it.
    expect(isCursorVisibleAt(root, input, 15, 12, allPainted)).toBe(true)
  })

  it('returns true when the declared cell is on a descendant of the declared node', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const wrapper = createNode('ink-box')
    setRect(wrapper, 10, 10, 30, 5)
    appendChildNode(root, wrapper)
    const innerText = createNode('ink-text')
    setRect(innerText, 12, 11, 20, 1)
    appendChildNode(wrapper, innerText)

    expect(isCursorVisibleAt(root, wrapper, 15, 11, allPainted)).toBe(true)
  })

  it('returns FALSE when a higher-z modal paints over the declared cell (A24 repro)', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    // Modal on top, absolute + zIndex, COVERING the cursor cell, AND
    // it actually painted (background/border/text). Cursor suppressed.
    const modal = createNode('ink-box')
    modal.style = { position: 'absolute', zIndex: 100 }
    setRect(modal, 5, 5, 50, 20)
    appendChildNode(root, modal)

    expect(isCursorVisibleAt(root, input, 15, 12, allPainted)).toBe(false)
  })

  it('returns TRUE when a transparent layout-only Box overlays the cell (codex review)', () => {
    // The codex P2: an empty absolute Box with no background / no border
    // / no text covers the input's cell at the layout level but never
    // wrote to the screen. hit-test resolves to the layout Box, but the
    // cell's screen contents are blank → NOT occluded → cursor visible.
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    const transparentOverlay = createNode('ink-box')
    transparentOverlay.style = { position: 'absolute', zIndex: 100 }
    setRect(transparentOverlay, 0, 0, 100, 100)
    appendChildNode(root, transparentOverlay)

    // Cell at (15, 12) is empty in the screen buffer (overlay never
    // painted). isCellPainted returns false → suppression skipped →
    // cursor visible.
    expect(isCursorVisibleAt(root, input, 15, 12, allEmpty)).toBe(true)
  })

  it('mixed: overlay only paints part of its rect — cursor under painted region suppressed, under empty region visible', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 50, 5)
    appendChildNode(root, input)

    // Overlay covers the input area at the layout level; in the screen
    // buffer it actually painted only at (20, 12) — say, a single
    // glyph. The other cells are blank (consumer used it as a positioning
    // wrapper around a small visible element).
    const overlay = createNode('ink-box')
    overlay.style = { position: 'absolute', zIndex: 100 }
    setRect(overlay, 10, 10, 50, 5)
    appendChildNode(root, overlay)

    const painted = paintedAt([[20, 12]])
    expect(isCursorVisibleAt(root, input, 20, 12, painted)).toBe(false) // painted cell → occluded
    expect(isCursorVisibleAt(root, input, 15, 12, painted)).toBe(true) // empty cell → visible
  })

  it('returns true when the modal covers a different cell than the cursor', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)
    const modal = createNode('ink-box')
    modal.style = { position: 'absolute', zIndex: 100 }
    setRect(modal, 50, 50, 30, 10)
    appendChildNode(root, modal)

    expect(isCursorVisibleAt(root, input, 15, 12, allPainted)).toBe(true)
  })

  it('returns true when the declared cell is inside a focused TextInput inside the modal', () => {
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

    expect(isCursorVisibleAt(root, modalInput, 17, 16, allPainted)).toBe(true)
  })

  it('returns false when the cell is off any rendered element', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)

    expect(isCursorVisibleAt(root, input, 200, 200, allPainted)).toBe(false)
  })

  it('returns true for a sibling that has higher z but DOES NOT cover the cursor cell', () => {
    const root = createNode('ink-root')
    setRect(root, 0, 0, 100, 100)
    const input = createNode('ink-box')
    setRect(input, 10, 10, 30, 5)
    appendChildNode(root, input)
    const otherModal = createNode('ink-box')
    otherModal.style = { position: 'absolute', zIndex: 100 }
    setRect(otherModal, 60, 60, 30, 10)
    appendChildNode(root, otherModal)

    expect(isCursorVisibleAt(root, input, 15, 12, allPainted)).toBe(true)
  })
})
