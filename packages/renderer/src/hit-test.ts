import { type DOMElement, markDirty, scheduleRenderFrom } from './dom'
import { ClickEvent } from './events/click-event'
import type { EventHandlerProps } from './events/event-handlers'
import { type GestureHandlers, MouseDownEvent } from './events/mouse-event'
import { nodeCache } from './node-cache'
import { markCommitStart } from './reconciler'

const DEFAULT_WHEEL_STEP = 3

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
  return hitTestExcluding(node, col, row, null)
}

/**
 * Same as `hitTest`, but skips `exclude` and its entire subtree as if
 * they weren't painted. Use during a captured drag's hover dispatch to
 * make the dragged element invisible to drop-target detection — without
 * this, the drag-time z boost on `<Draggable>` makes it the topmost
 * painted node under the cursor, and `dispatchHover` resolves to the
 * draggable itself instead of the drop zone underneath.
 *
 * Pass `null` for no exclusion (equivalent to `hitTest`).
 */
export function hitTestExcluding(
  node: DOMElement,
  col: number,
  row: number,
  exclude: DOMElement | null,
): DOMElement | null {
  if (exclude !== null && node === exclude) return null
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
    const hit = hitTestExcluding(childElem, col, row, exclude)
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
  //
  // `claimFocusOnClick={false}` opts a focusable out of click-to-focus
  // — the node still participates in Tab navigation (tabIndex >= 0)
  // but mouse-clicking it doesn't move focus. The walk stops at the
  // first focusable found (matching the current first-tabIndex-wins
  // convention) and either focuses or doesn't based on this attribute;
  // it does NOT keep walking past an opted-out focusable to find an
  // ancestor, because the user's click intent landed on the deepest
  // focusable, not on a parent. Used by Checkbox / Radio so toggling
  // doesn't tear focus from a peer TextInput (live-preview UX).
  if (root.focusManager) {
    let focusTarget: DOMElement | undefined = target
    while (focusTarget) {
      if (typeof focusTarget.attributes.tabIndex === 'number') {
        if (focusTarget.attributes.claimFocusOnClick !== false) {
          root.focusManager.handleClickFocus(focusTarget)
        }
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
 * Captured-gesture record returned by dispatchMouseDown. Carries the
 * handlers, whether the capture is tentative (only commits on motion;
 * see MouseDownEvent.captureGestureTentatively), and the DOM node that
 * fired the captureGesture call (the gesture "source"). The source is
 * used by the App-level coordinator to exclude the dragged element
 * from drag-time hover hit-testing — without that, the dragged
 * element's drag-time z boost makes it the topmost painted node under
 * the cursor and `dispatchHover` resolves to it instead of the drop
 * zone underneath.
 */
export type CapturedGesture = {
  handlers: GestureHandlers
  tentative: boolean
  sourceNode: DOMElement | null
}

/**
 * Hit-test the root at (col, row) and bubble a MouseDownEvent from the
 * deepest containing node up through parentNode. Only nodes with an
 * onMouseDown handler fire. Stops when a handler calls
 * stopImmediatePropagation() or captures the gesture. Capture is
 * leaf-first so descendants cannot be overwritten by ancestors.
 *
 * Returns a CapturedGesture if any handler called captureGesture or
 * captureGestureTentatively, or null otherwise. The caller (App) is
 * responsible for storing the handlers as the active gesture, applying
 * the tentative-vs-confirmed semantics, and routing subsequent motion
 * + release events.
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
): CapturedGesture | null {
  let target: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  if (!target) return null

  const event = new MouseDownEvent(col, row, button)
  let captureSource: DOMElement | null = null
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
      if (event.gestureCaptured) {
        // First-call-wins on the capture (see MouseDownEvent), so the
        // first node that captured is the source. Capture the target at
        // THIS iteration so we don't reassign across the bubble loop.
        captureSource = target
        break
      }
      if (event.didStopImmediatePropagation()) break
    }
    target = target.parentNode
  }
  if (!event._capturedHandlers) return null
  return {
    handlers: event._capturedHandlers,
    tentative: event._tentative,
    sourceNode: captureSource,
  }
}

function scrollBoxWheelStep(node: DOMElement): number {
  const raw = node.attributes.scrollWheelStep
  if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) return DEFAULT_WHEEL_STEP
  return Math.floor(raw)
}

function scrollBoxAcceptsWheel(node: DOMElement): boolean {
  return node.attributes.scrollBox === true && node.attributes.disableWheel !== true
}

function scheduleScrollRender(node: DOMElement): void {
  if (node.scrollRenderQueued) return
  node.scrollRenderQueued = true
  queueMicrotask(() => {
    node.scrollRenderQueued = false
    scheduleRenderFrom(node)
  })
}

function notifyScrollListeners(node: DOMElement): void {
  for (const listener of node.scrollListeners ?? []) listener()
}

function applyWheelScroll(node: DOMElement, dy: number): void {
  const previousSticky = node.stickyScroll
  const wasSticky = previousSticky ?? Boolean(node.attributes.stickyScroll)
  const previousAnchor = node.scrollAnchor
  node.stickyScroll = false
  node.scrollAnchor = undefined
  const current = node.scrollTop ?? 0
  const delta = Math.floor(dy)
  if (!Number.isFinite(delta)) return

  const target = Math.max(0, current + (node.pendingScrollDelta ?? 0) + delta)
  const pending = target - current
  const previousPending = node.pendingScrollDelta
  node.pendingScrollDelta = pending === 0 ? undefined : pending
  const stateChanged =
    node.pendingScrollDelta !== previousPending || wasSticky || previousAnchor !== undefined
  if (!stateChanged) return

  markDirty(node)
  markCommitStart()
  notifyScrollListeners(node)
  scheduleScrollRender(node)
}

/**
 * Hit-test a terminal wheel event and apply the default ScrollBox behavior.
 *
 * Wheel remains a ParsedKey for `useInput` backwards compatibility, but the
 * default scroll target is spatial: the nearest ScrollBox viewport under the
 * cursor should scroll, with nested ScrollBoxes naturally winning over
 * ancestors. Returns true when a ScrollBox accepted the wheel.
 */
export function dispatchWheel(
  root: DOMElement,
  col: number,
  row: number,
  direction: 'up' | 'down',
): boolean {
  let target: DOMElement | undefined = hitTest(root, col, row) ?? undefined
  while (target) {
    if (scrollBoxAcceptsWheel(target)) {
      const step = scrollBoxWheelStep(target)
      applyWheelScroll(target, direction === 'up' ? -step : step)
      return true
    }
    target = target.parentNode
  }
  return false
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
  exclude: DOMElement | null = null,
): void {
  const next = new Set<DOMElement>()
  let node: DOMElement | undefined = hitTestExcluding(root, col, row, exclude) ?? undefined
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
