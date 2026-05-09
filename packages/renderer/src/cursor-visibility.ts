/**
 * Cursor-visibility helpers for the z-stacking suppression check
 * applied at finalize time in `ink.tsx`. Extracted so the logic can be
 * unit-tested against hand-built DOM trees (same pattern as
 * `hit-test.ts` itself) without spinning up the full render pipeline.
 *
 * Why this exists: `useDeclaredCursor` is last-write-wins. Without
 * occlusion-awareness, a `<TextInput>`'s caret keeps rendering at its
 * declared cell even when a modal Box paints over that cell. Cursors
 * are paint primitives and should follow the same z-stacking the rest
 * of the renderer uses; this module supplies the predicate that says
 * "is the declared cell still the declarer's to own?"
 */

import type { DOMElement } from './dom'
import { hitTest } from './hit-test'

/**
 * True if `node` is `ancestor` itself or any descendant of it (walks
 * the parentNode chain).
 */
export function isDescendantOrSelf(node: DOMElement, ancestor: DOMElement): boolean {
  let n: DOMElement | undefined = node
  while (n) {
    if (n === ancestor) return true
    n = n.parentNode
  }
  return false
}

/**
 * True if a cursor declared by `declaredNode` at screen cell (col, row)
 * should be visually rendered. Uses `hitTest` (the renderer's z-aware
 * paint-order resolver) at the cell — if the topmost element is the
 * declarer or a descendant of it, the declarer's subtree owns the
 * cell visually and the cursor should park. Otherwise something else
 * paints on top (modal, tooltip, drag preview) and the cursor must be
 * suppressed to match what the user sees.
 */
export function isCursorVisibleAt(
  root: DOMElement,
  declaredNode: DOMElement,
  col: number,
  row: number,
): boolean {
  const hit = hitTest(root, col, row)
  if (hit === null) return false
  return isDescendantOrSelf(hit, declaredNode)
}
