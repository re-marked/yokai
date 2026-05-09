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
 * should be visually rendered.
 *
 * Two-stage check:
 *
 * 1. **Cell painted?** — `isCellPainted(col, row)` asks the screen
 *    buffer whether anything was actually written to the cell this
 *    frame. An empty cell can't occlude — even if a higher-z layout
 *    wrapper's rect contains the cell, it didn't paint anything
 *    visible, so the declarer's subtree (or just blank space) shows
 *    through and the cursor should render. Without this guard, an
 *    empty `<Box position="absolute" zIndex={100}>` overlay covering
 *    the screen would suppress every cursor below it (codex review
 *    on PR #86).
 *
 * 2. **Topmost layout owner is the declarer?** — `hitTest` returns
 *    the topmost paint-order element whose layout rect contains the
 *    cell. If it's the declarer or a descendant, the declarer owns
 *    the cell visually and the cursor parks. Otherwise something
 *    above the declarer wrote into this cell and the cursor must be
 *    suppressed to match what the user sees.
 *
 * The screen-buffer check via `isCellPainted` is provided by the
 * caller (ink.tsx wraps `screen.isEmptyCellAt`) so this module stays
 * dependency-light and unit-testable against stubbed cells.
 */
export function isCursorVisibleAt(
  root: DOMElement,
  declaredNode: DOMElement,
  col: number,
  row: number,
  isCellPainted: (col: number, row: number) => boolean,
): boolean {
  // Empty cells can never occlude. Cursor renders.
  if (!isCellPainted(col, row)) return true
  const hit = hitTest(root, col, row)
  if (hit === null) return false
  return isDescendantOrSelf(hit, declaredNode)
}
