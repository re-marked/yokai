/**
 * FocusGroup tests.
 *
 * The arrow-key handling is React + useInput driven; we test by
 * exercising the pure helpers (`collectTabbablesInSubtree`,
 * `isDescendant`) and the navigation math against a hand-built tree
 * + FocusManager. The full React render path is exercised by the
 * focus-nav demo.
 */

import { describe, expect, it } from 'vitest'
import { type DOMElement, appendChildNode, createNode, setAttribute } from '../dom.js'
import { FocusManager } from '../focus.js'
import { collectTabbablesInSubtree, isDescendant } from './FocusGroup.js'

function box(tabIndex?: number): DOMElement {
  const n = createNode('ink-box')
  if (typeof tabIndex === 'number') setAttribute(n, 'tabIndex', tabIndex)
  return n
}

// ── pure helpers ─────────────────────────────────────────────────────

describe('collectTabbablesInSubtree', () => {
  it('returns empty when subtree has no tabbables', () => {
    const root = box()
    appendChildNode(root, box())
    appendChildNode(root, box())
    expect(collectTabbablesInSubtree(root)).toEqual([])
  })

  it('collects tabbable direct children in tree order', () => {
    const root = box()
    const a = box(0)
    const b = box(0)
    appendChildNode(root, a)
    appendChildNode(root, b)
    expect(collectTabbablesInSubtree(root)).toEqual([a, b])
  })

  it('collects tabbable descendants at any depth', () => {
    const root = box()
    const wrapper = box()
    const inner = box(0)
    const sibling = box(0)
    appendChildNode(root, wrapper)
    appendChildNode(wrapper, inner)
    appendChildNode(root, sibling)
    expect(collectTabbablesInSubtree(root)).toEqual([inner, sibling])
  })

  it('skips tabIndex < 0 (programmatic-focus-only)', () => {
    const root = box()
    const skipped = box(-1)
    const included = box(0)
    appendChildNode(root, skipped)
    appendChildNode(root, included)
    expect(collectTabbablesInSubtree(root)).toEqual([included])
  })

  it('includes the root itself when it has tabIndex', () => {
    const root = box(0)
    const child = box(0)
    appendChildNode(root, child)
    expect(collectTabbablesInSubtree(root)).toEqual([root, child])
  })

  it('skips text nodes during the walk', () => {
    const root = box()
    const wrapper = box()
    appendChildNode(root, wrapper)
    // No text nodes added here (text is created by createTextNode), but
    // the walker's `nodeName !== '#text'` guard is a contract — verify
    // by ensuring an empty wrapper doesn't break iteration.
    appendChildNode(wrapper, box(0))
    expect(collectTabbablesInSubtree(root)).toHaveLength(1)
  })
})

describe('isDescendant', () => {
  it('returns true for the same node (a node is its own descendant)', () => {
    const a = box()
    expect(isDescendant(a, a)).toBe(true)
  })

  it('returns true for a direct child', () => {
    const a = box()
    const b = box()
    appendChildNode(a, b)
    expect(isDescendant(b, a)).toBe(true)
  })

  it('returns true for a nested grandchild', () => {
    const a = box()
    const b = box()
    const c = box()
    appendChildNode(a, b)
    appendChildNode(b, c)
    expect(isDescendant(c, a)).toBe(true)
  })

  it('returns false when the candidate is not in the ancestor chain', () => {
    const a = box()
    const b = box()
    expect(isDescendant(a, b)).toBe(false)
  })

  it('returns false for a sibling (sibling is not a descendant)', () => {
    const root = box()
    const a = box()
    const b = box()
    appendChildNode(root, a)
    appendChildNode(root, b)
    expect(isDescendant(a, b)).toBe(false)
  })
})

// ── navigation math against a real FocusManager ──────────────────────

/** Build a small tree with a "group" wrapper and N tabbable items
 *  inside, plus an outside-the-group tabbable to assert ownership
 *  semantics. */
function setupGroupTree(itemCount: number): {
  fm: FocusManager
  root: DOMElement
  group: DOMElement
  items: DOMElement[]
  outside: DOMElement
} {
  const fm = new FocusManager(() => false)
  const root = createNode('ink-root')
  root.focusManager = fm
  const group = box()
  appendChildNode(root, group)
  const items: DOMElement[] = []
  for (let i = 0; i < itemCount; i++) {
    const item = box(0)
    appendChildNode(group, item)
    items.push(item)
  }
  const outside = box(0)
  appendChildNode(root, outside)
  return { fm, root, group, items, outside }
}

describe('FocusGroup navigation logic', () => {
  // The FocusGroup's useInput callback runs this exact recipe; tests
  // here drive the same steps with a real FocusManager.

  function navigate(
    fm: FocusManager,
    group: DOMElement,
    move: -1 | 1,
    wrap: boolean,
  ): void {
    if (!fm.activeElement) return
    if (!isDescendant(fm.activeElement, group)) return
    const tabbables = collectTabbablesInSubtree(group)
    if (tabbables.length === 0) return
    const idx = tabbables.indexOf(fm.activeElement)
    if (idx === -1) return
    let next = idx + move
    if (next < 0 || next >= tabbables.length) {
      if (!wrap) return
      next = (next + tabbables.length) % tabbables.length
    }
    const target = tabbables[next]
    if (target) fm.focus(target)
  }

  it('moves focus forward through items', () => {
    const { fm, group, items } = setupGroupTree(3)
    fm.focus(items[0]!)
    navigate(fm, group, 1, false)
    expect(fm.activeElement).toBe(items[1])
    navigate(fm, group, 1, false)
    expect(fm.activeElement).toBe(items[2])
  })

  it('moves focus backward through items', () => {
    const { fm, group, items } = setupGroupTree(3)
    fm.focus(items[2]!)
    navigate(fm, group, -1, false)
    expect(fm.activeElement).toBe(items[1])
  })

  it('does NOT move past the last item without wrap', () => {
    const { fm, group, items } = setupGroupTree(3)
    fm.focus(items[2]!)
    navigate(fm, group, 1, false)
    expect(fm.activeElement).toBe(items[2])
  })

  it('does NOT move before the first item without wrap', () => {
    const { fm, group, items } = setupGroupTree(3)
    fm.focus(items[0]!)
    navigate(fm, group, -1, false)
    expect(fm.activeElement).toBe(items[0])
  })

  it('wraps from last to first when wrap=true', () => {
    const { fm, group, items } = setupGroupTree(3)
    fm.focus(items[2]!)
    navigate(fm, group, 1, true)
    expect(fm.activeElement).toBe(items[0])
  })

  it('wraps from first to last when wrap=true', () => {
    const { fm, group, items } = setupGroupTree(3)
    fm.focus(items[0]!)
    navigate(fm, group, -1, true)
    expect(fm.activeElement).toBe(items[2])
  })

  it('does NOT navigate when focus is OUTSIDE the group', () => {
    const { fm, group, items, outside } = setupGroupTree(3)
    fm.focus(outside)
    navigate(fm, group, 1, true)
    expect(fm.activeElement).toBe(outside)
    void items
  })

  it('does NOT navigate when there is no current focus', () => {
    const { fm, group, items } = setupGroupTree(3)
    expect(fm.activeElement).toBeNull()
    navigate(fm, group, 1, true)
    expect(fm.activeElement).toBeNull()
    void items
  })

  it('handles a group with a single tabbable (move is a no-op without wrap)', () => {
    const { fm, group, items } = setupGroupTree(1)
    fm.focus(items[0]!)
    navigate(fm, group, 1, false)
    expect(fm.activeElement).toBe(items[0])
  })

  it('with wrap and a single tabbable, move stays on the same element', () => {
    const { fm, group, items } = setupGroupTree(1)
    fm.focus(items[0]!)
    navigate(fm, group, 1, true)
    // (idx + move + length) % length = (0 + 1 + 1) % 1 = 0
    expect(fm.activeElement).toBe(items[0])
  })

  it('handles an empty group (no tabbables) gracefully', () => {
    const { fm, group } = setupGroupTree(0)
    // Focus is null, group is empty → nothing happens, no throw.
    navigate(fm, group, 1, true)
    expect(fm.activeElement).toBeNull()
  })
})
