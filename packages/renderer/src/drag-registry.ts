/**
 * Drag/drop coordination registry.
 *
 * One active drag at a time (gestures are exclusive at the App level).
 * `<Draggable>` calls `startDrag` on the first motion event of a press,
 * `tickDrag` on each subsequent motion, and `dispatchDrop` + `endDrag`
 * at release. `<DropTarget>` registers itself on mount and unregisters
 * on unmount; tick walks the registered set, computes which targets
 * currently contain the cursor, and fires the right enter / over / leave
 * deltas relative to the previous tick.
 *
 * The registry is module-scope (mutable) because the draggable / drop-
 * target relationship is global to the App — there's no React tree
 * containment that constrains which Draggable can drop on which target.
 * A user dragging in container A can perfectly well drop on a target in
 * container B, so we can't piggyback on React context.
 */
import type { DOMElement } from './dom.js'
import { nodeCache } from './node-cache.js'

/**
 * Payload passed to drop-target callbacks. `cursor` is in screen-cell
 * coordinates (0-indexed). `local` is cursor minus the target's top-left,
 * so a target at screen (10, 5) reporting `local = (3, 1)` means the
 * cursor is 3 cols + 1 row inside its top-left corner — the same
 * convention `ClickEvent.localCol` / `localRow` use.
 */
export type DropInfo = {
  data: unknown
  cursor: { col: number; row: number }
  local: { col: number; row: number }
}

/**
 * Callback bundle the registry reads each tick. Wrapped in a getter so
 * the entry holds a STABLE reference for the lifetime of the registration
 * but the values it returns are always the latest props from the
 * subscribing component (re-rendered or not).
 */
export type DropTargetCallbacks = {
  accept?: (data: unknown) => boolean
  onDragEnter?: (info: DropInfo) => void
  onDragOver?: (info: DropInfo) => void
  onDragLeave?: () => void
  onDrop?: (info: DropInfo) => void
}

type DropTargetEntry = {
  /** Lazily-resolved DOM node — refs aren't populated until after mount,
   *  so `registerDropTarget` is called from useEffect with a getter that
   *  reads the ref each tick. Returns null when the ref is detached
   *  (transient during reorder); registry skips null entries. */
  getNode: () => DOMElement | null
  /** Latest callback bundle. The component overwrites the value behind
   *  this getter on every render so closures captured at registration
   *  time still see fresh handlers. */
  getCallbacks: () => DropTargetCallbacks
}

const targets = new Map<symbol, DropTargetEntry>()
let activeDrag: { data: unknown } | null = null
const containingPrev = new Set<symbol>()

/** Register a drop target. Returns an opaque id used to unregister.
 *  Called from `<DropTarget>`'s mount effect. */
export function registerDropTarget(entry: DropTargetEntry): symbol {
  const id = Symbol('DropTarget')
  targets.set(id, entry)
  return id
}

export function unregisterDropTarget(id: symbol): void {
  targets.delete(id)
  containingPrev.delete(id)
}

/** Reset registry state. Internal/test use only — not part of the
 *  public API. Demos and apps never need this. @internal */
export function _resetDragRegistryForTesting(): void {
  targets.clear()
  containingPrev.clear()
  activeDrag = null
}

/** Begin tracking an active drag. Called by `<Draggable>` on the FIRST
 *  motion of a press (i.e. when the gesture has actually become a drag),
 *  not at press time — a press without motion does not engage drop
 *  targets. */
export function startDrag(data: unknown): void {
  activeDrag = { data }
  containingPrev.clear()
}

/** True iff a drag is currently in progress. */
export function isDragActive(): boolean {
  return activeDrag !== null
}

/**
 * Walk all registered targets, compute which currently contain the cursor
 * (and accept the active drag's data), and fire enter / over / leave
 * relative to the last tick. Multiple targets can be "containing" at the
 * same time (nested or overlapping); enter/over/leave fire on each
 * independently — matches DOM `dragenter`/`dragover` semantics where
 * each ancestor in the chain receives the event.
 */
export function tickDrag(col: number, row: number): void {
  if (!activeDrag) return
  const data = activeDrag.data
  const containingNow = new Set<symbol>()
  for (const [id, entry] of targets) {
    const node = entry.getNode()
    if (!node) continue
    const rect = nodeCache.get(node)
    if (!rect) continue
    if (col < rect.x || col >= rect.x + rect.width || row < rect.y || row >= rect.y + rect.height)
      continue
    const cb = entry.getCallbacks()
    if (cb.accept && !cb.accept(data)) continue
    containingNow.add(id)
    const local = { col: col - rect.x, row: row - rect.y }
    const info: DropInfo = { data, cursor: { col, row }, local }
    if (!containingPrev.has(id)) cb.onDragEnter?.(info)
    cb.onDragOver?.(info)
  }
  // Fire leave for anything in prev but not now. Read callbacks fresh —
  // the target may have re-rendered with a new handler bundle since the
  // last tick, and we want the latest.
  for (const id of containingPrev) {
    if (!containingNow.has(id)) {
      targets.get(id)?.getCallbacks().onDragLeave?.()
    }
  }
  containingPrev.clear()
  for (const id of containingNow) containingPrev.add(id)
}

/**
 * Fire `onDrop` on the topmost (paint-order) drop target containing the
 * cursor that accepts the dragged data. Returns true if any target
 * received the drop, false otherwise. Source `<Draggable>` uses the
 * return value to populate `onDragEnd`'s `dropped` field so it can
 * react (e.g. snap back if no target accepted).
 *
 * Topmost = highest effective z-index, with deeper-in-tree as the
 * tie-breaker. Mirrors how the renderer paints overlapping absolute
 * boxes; the user's eye and the drop target see the same winner.
 */
export function dispatchDrop(col: number, row: number): boolean {
  if (!activeDrag) return false
  const data = activeDrag.data
  type Cand = {
    id: symbol
    entry: DropTargetEntry
    rectX: number
    rectY: number
    z: number
    depth: number
  }
  const cands: Cand[] = []
  for (const [id, entry] of targets) {
    const node = entry.getNode()
    if (!node) continue
    const rect = nodeCache.get(node)
    if (!rect) continue
    if (col < rect.x || col >= rect.x + rect.width || row < rect.y || row >= rect.y + rect.height)
      continue
    const cb = entry.getCallbacks()
    if (cb.accept && !cb.accept(data)) continue
    const z = node.style.position === 'absolute' ? (node.style.zIndex ?? 0) : 0
    cands.push({ id, entry, rectX: rect.x, rectY: rect.y, z, depth: nodeDepth(node) })
  }
  if (cands.length === 0) return false
  cands.sort((a, b) => b.z - a.z || b.depth - a.depth)
  const top = cands[0]!
  top.entry.getCallbacks().onDrop?.({
    data,
    cursor: { col, row },
    local: { col: col - top.rectX, row: row - top.rectY },
  })
  return true
}

/**
 * End the active drag. Fires `onDragLeave` on any target the cursor
 * was still inside at end-time so subscribers can clean up hover
 * styling without observing the gesture transition explicitly.
 * Idempotent — calling without an active drag is a no-op.
 */
export function endDrag(): void {
  if (!activeDrag) return
  for (const id of containingPrev) {
    targets.get(id)?.getCallbacks().onDragLeave?.()
  }
  containingPrev.clear()
  activeDrag = null
}

function nodeDepth(node: DOMElement): number {
  let n: DOMElement | undefined = node
  let d = 0
  while (n?.parentNode) {
    d++
    n = n.parentNode
  }
  return d
}
