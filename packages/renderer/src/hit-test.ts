import type { DOMElement } from './dom'
import { ClickEvent } from './events/click-event'
import type { EventHandlerProps } from './events/event-handlers'
import { type GestureHandlers, MouseDownEvent } from './events/mouse-event'
import { nodeCache } from './node-cache'

/** Effective z-index for hit-testing — mirrors the renderer's
 *  effectiveZ in render-node-to-output.ts. Only absolutes participate
 *  in stacking; everything else returns 0. Same paint-order math
 *  used here means hit-test agrees with what the user sees. */
function effectiveZ(node: DOMElement): number {
  if (node.style.position !== 'absolute') return 0
  return node.style.zIndex ?? 0
}

/**
 * Find the deepest DOM element whose rendered rect contains (col, row).
 *
 * Uses the nodeCache populated by renderNodeToOutput — rects are in screen
 * coordinates with all offsets (including scrollTop translation) already
 * applied. Nodes not in nodeCache (not rendered this frame, or lacking a
 * yogaNode) are skipped along with their subtrees.
 *
 * **Hit ordering matches paint order**: children are tried in reverse
 * (effectiveZ, treeOrder) — same sort the renderer uses for paint. Without
 * this, hit-test would resolve clicks by raw DOM order, ignoring zIndex
 * boosts (e.g. raise-on-press patterns where the most-recently-pressed
 * box has been bumped above siblings).
 *
 * **Absolute children that escape parent bounds are still hit-tested.**
 * In CSS, `position: absolute` is positioned in its own coordinate space
 * — the child's painted rect is independent of its ancestor's rect.
 * Naively bailing when the cursor isn't inside an ancestor would miss
 * absolutes that have been dragged outside their container. So when
 * the click is OUTSIDE this node's rect we still recurse, but only into
 * absolute children (in-flow children are constrained by Yoga to stay
 * within ancestor bounds, so the bail is correct for them).
 *
 * Returns the hit node even if it has no onClick — dispatchClick walks up
 * via parentNode to find handlers.
 */
export function hitTest(node: DOMElement, col: number, row: number): DOMElement | null {
  const rect = nodeCache.get(node)
  if (!rect) return null
  const inBounds =
    col >= rect.x && col < rect.x + rect.width && row >= rect.y && row < rect.y + rect.height

  // Build the iteration order matching paint order. Most parents have
  // no z-indexed absolute children — skip the sort and just walk in
  // reverse tree order.
  let needsSort = false
  for (const c of node.childNodes) {
    if (c.nodeName === '#text') continue
    const elem = c as DOMElement
    if (elem.style.position === 'absolute' && (elem.style.zIndex ?? 0) !== 0) {
      needsSort = true
      break
    }
  }
  // Iterate in reverse paint order so the topmost match wins. For the
  // sorted case we copy + sort by (effectiveZ, treeOrder) ASC, then
  // walk back-to-front. For the no-sort case we just iterate the
  // childNodes array in reverse.
  let orderedReversed: typeof node.childNodes
  if (needsSort) {
    const indexed = node.childNodes.map((c, i) => ({ node: c, i }))
    indexed.sort((a, b) => {
      const za = a.node.nodeName === '#text' ? 0 : effectiveZ(a.node as DOMElement)
      const zb = b.node.nodeName === '#text' ? 0 : effectiveZ(b.node as DOMElement)
      if (za !== zb) return za - zb
      return a.i - b.i
    })
    orderedReversed = indexed.reverse().map((e) => e.node)
  } else {
    orderedReversed = node.childNodes.slice().reverse()
  }

  for (const child of orderedReversed) {
    if (child.nodeName === '#text') continue
    const childElem = child as DOMElement
    // When this node doesn't contain the click, only absolute children
    // are worth checking — in-flow children stay within ancestor bounds
    // by construction (Yoga places them inside the parent's content
    // area). Skipping them when out-of-bounds avoids quadratic walks
    // through deep in-flow subtrees that can never contain the click.
    if (!inBounds && childElem.style.position !== 'absolute') continue
    const hit = hitTest(childElem, col, row)
    if (hit) return hit
  }
  // Self only matches if the click is actually within our own rect.
  // When out-of-bounds we may have descended into absolute children
  // (above) but we ourselves aren't a hit candidate.
  return inBounds ? node : null
}

/**
 * Hit-test the root at (col, row) and bubble a ClickEvent from the deepest
 * containing node up through parentNode. Only nodes with an onClick handler
 * fire. Stops when a handler calls stopImmediatePropagation(). Returns
 * true if at least one onClick handler fired.
 */
export function dispatchClick(
  root: DOMElement,
  col: number,
  row: number,
  cellIsBlank = false,
): boolean {
  let target: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  if (!target) return false

  // Click-to-focus: find the closest focusable ancestor and focus it.
  // root is always ink-root, which owns the FocusManager.
  if (root.focusManager) {
    let focusTarget: DOMElement | undefined = target
    while (focusTarget) {
      if (typeof focusTarget.attributes.tabIndex === 'number') {
        root.focusManager.handleClickFocus(focusTarget)
        break
      }
      focusTarget = focusTarget.parentNode
    }
  }
  const event = new ClickEvent(col, row, cellIsBlank)
  let handled = false
  while (target) {
    const handler = target._eventHandlers?.onClick as ((event: ClickEvent) => void) | undefined
    if (handler) {
      handled = true
      const rect = nodeCache.get(target)
      if (rect) {
        event.localCol = col - rect.x
        event.localRow = row - rect.y
      }
      handler(event)
      if (event.didStopImmediatePropagation()) return true
    }
    target = target.parentNode
  }
  return handled
}

/**
 * Hit-test the root at (col, row) and bubble a MouseDownEvent from the
 * deepest containing node up through parentNode. Only nodes with an
 * onMouseDown handler fire. Stops when a handler calls
 * stopImmediatePropagation().
 *
 * Returns the GestureHandlers installed via event.captureGesture() if
 * any handler called it, or null otherwise. The caller (App) is
 * responsible for storing those handlers as the active gesture and
 * routing subsequent motion + release events to them.
 *
 * Unlike dispatchClick, this does NOT trigger click-to-focus. Focus
 * still moves on click (i.e. on release after a non-drag press), so
 * the focus side-effect remains tied to the user's intent of "I
 * pressed and released here without dragging."
 */
export function dispatchMouseDown(
  root: DOMElement,
  col: number,
  row: number,
  button: number,
): GestureHandlers | null {
  let target: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  if (!target) return null

  const event = new MouseDownEvent(col, row, button)
  while (target) {
    const handler = target._eventHandlers?.onMouseDown as
      | ((event: MouseDownEvent) => void)
      | undefined
    if (handler) {
      const rect = nodeCache.get(target)
      if (rect) {
        event.localCol = col - rect.x
        event.localRow = row - rect.y
      }
      handler(event)
      if (event.didStopImmediatePropagation()) break
    }
    target = target.parentNode
  }
  return event._capturedHandlers
}

/**
 * Fire onMouseEnter/onMouseLeave as the pointer moves. Like DOM
 * mouseenter/mouseleave: does NOT bubble — moving between children does
 * not re-fire on the parent. Walks up from the hit node collecting every
 * ancestor with a hover handler; diffs against the previous hovered set;
 * fires leave on the nodes exited, enter on the nodes entered.
 *
 * Mutates `hovered` in place so the caller (App instance) can hold it
 * across calls. Clears the set when the hit is null (cursor moved into a
 * non-rendered gap or off the root rect).
 */
export function dispatchHover(
  root: DOMElement,
  col: number,
  row: number,
  hovered: Set<DOMElement>,
): void {
  const next = new Set<DOMElement>()
  let node: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  while (node) {
    const h = node._eventHandlers as EventHandlerProps | undefined
    if (h?.onMouseEnter || h?.onMouseLeave) next.add(node)
    node = node.parentNode
  }
  for (const old of hovered) {
    if (!next.has(old)) {
      hovered.delete(old)
      // Skip handlers on detached nodes (removed between mouse events)
      if (old.parentNode) {
        ;(old._eventHandlers as EventHandlerProps | undefined)?.onMouseLeave?.()
      }
    }
  }
  for (const n of next) {
    if (!hovered.has(n)) {
      hovered.add(n)
      ;(n._eventHandlers as EventHandlerProps | undefined)?.onMouseEnter?.()
    }
  }
}
