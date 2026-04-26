import type React from 'react'
import { useCallback, useRef, useState } from 'react'
import type { Except } from 'type-fest'
import { dispatchDrop, endDrag, startDrag, tickDrag } from '../drag-registry.js'
import type { MouseDownEvent, MouseMoveEvent, MouseUpEvent } from '../events/mouse-event.js'
import Box, { type Props as BoxProps } from './Box.js'

/**
 * A position in cell coordinates relative to the parent's content edge.
 * Mirrors yoga's absolute-positioning convention: `top`/`left` are integer
 * cell offsets, the same shape Yoga's `top`/`left` style accepts.
 */
export type DragPos = { top: number; left: number }

/**
 * Constraints in cell dimensions. When supplied, the draggable's `top`
 * stays within `[0, height - draggableHeight]` and `left` within
 * `[0, width - draggableWidth]`. Use the parent container's interior
 * dimensions to clamp inside it (the constrained-drag demo does this).
 */
export type DragBounds = { width: number; height: number }

/**
 * Lifecycle payload passed to onDragStart / onDrag / onDragEnd.
 * `delta` is screen-space cell delta from the press point — not from
 * the previous frame. `dropped` is only set on `onDragEnd` and indicates
 * whether a `<DropTarget>` accepted the drop (true) or the box landed
 * on empty terminal space (false). Source consumers use this to e.g.
 * snap-back if no target took the drop.
 */
export type DragInfo = {
  pos: DragPos
  startPos: DragPos
  delta: { dx: number; dy: number }
  dropped?: boolean
}

export type DraggableProps = Except<
  BoxProps,
  // We own placement and the press handler. Letting the user override
  // `position` would break drag math; overriding `top`/`left` would
  // fight the internal pos state every render.
  'position' | 'top' | 'left' | 'onMouseDown'
> & {
  /**
   * Where the draggable sits before the user moves it. Cell offsets
   * relative to the parent's content edge, same as `<Box top>` / `<Box left>`.
   * Internal state seeds from this on mount; subsequent renders use the
   * dragged position. Changing this prop after mount is ignored — treat it
   * as initial-state-only, like React's `defaultValue`.
   */
  initialPos: DragPos
  /**
   * Optional bounds in the parent's content space. When set, drag motion
   * clamps the new position so the draggable's full rect stays inside
   * `[0,0]` to `[bounds.width, bounds.height]`. When omitted, drag is
   * unbounded — useful for "free" pieces that can land anywhere on screen
   * (the constrained-drag demo's `magenta`/`orange` boxes).
   */
  bounds?: DragBounds
  /**
   * When true, press events are ignored — no gesture is captured, no
   * z-index bump, no callbacks fire. The element still renders and
   * occupies space; it's just immobile. Mirrors HTML `<input disabled>`
   * for click semantics.
   */
  disabled?: boolean
  /**
   * Fires once per gesture, the first time the cursor MOVES after press
   * (NOT on press itself). A press+release with no motion is not a drag,
   * so this won't fire — that lets you treat sub-cell-cursor twitches
   * as clicks rather than spurious drag-starts.
   */
  onDragStart?: (info: DragInfo) => void
  /**
   * Fires on every cell-crossing motion event during the drag. Useful
   * for live previews, syncing pos to a parent store, snapping
   * indicators, etc. Called AFTER the internal pos state updates.
   */
  onDrag?: (info: DragInfo) => void
  /**
   * Fires once at release if the gesture became a drag (i.e. onDragStart
   * fired). The pos at this point is the final landing spot, already
   * clamped to bounds.
   */
  onDragEnd?: (info: DragInfo) => void
  /**
   * Arbitrary payload to attach to this drag. Forwarded to any
   * `<DropTarget>` the box hovers over or is released onto. Use to carry
   * the identity of the dragged item ({ id: 'card-3' }), its kind for
   * `accept` filtering, or whatever the receiving target needs to
   * reconcile its own state on drop.
   *
   * Plain `unknown` rather than a generic — TUI app data is usually
   * heterogeneous, and a user-supplied generic on `<Draggable>` would
   * fight every JSX call site. Cast on the receiving side.
   */
  dragData?: unknown
}

/**
 * Draggable cell rectangle. Press, hold, drag, release. Behaviors baked
 * in to match real-world expectations:
 *
 * - **Press anchors at cursor offset** so the grabbed point stays under
 *   the cursor as the box moves. (Without this, picking up a box by its
 *   right edge would teleport it to align under the cursor at the start
 *   of the drag — jarring.)
 * - **Raise on press**: each press bumps the box's z-index above any
 *   sibling's. Persists after release so the most-recently-grabbed box
 *   stays on top — re-grabbable from the same screen position rather
 *   than getting buried under a sibling that was last in tree order.
 * - **Drag-time z boost**: while a drag is in progress the box paints
 *   ~1000 above its persisted z, so it stays on top of every sibling
 *   regardless of their persisted z values.
 * - **Bounds clamping** (optional): the box's top-left can range over
 *   `[(0,0), (bounds.width - width, bounds.height - height)]`, inclusive
 *   — i.e. the box's bottom-right edge can land exactly on the bounds'
 *   bottom-right edge but no further.
 *
 * @example
 *   <Draggable
 *     initialPos={{ top: 0, left: 0 }}
 *     width={20}
 *     height={3}
 *     bounds={{ width: 80, height: 24 }}
 *     backgroundColor="cyan"
 *     onDragEnd={({ pos }) => persist(pos)}
 *   />
 */
export default function Draggable({
  initialPos,
  bounds,
  disabled,
  onDragStart,
  onDrag,
  onDragEnd,
  dragData,
  ...boxProps
}: DraggableProps): React.ReactNode {
  const [pos, setPos] = useState<DragPos>(initialPos)
  const [isDragging, setIsDragging] = useState(false)
  // Persisted z-index: bumped on each press, retained after release
  // so the box stays in front of siblings it was just dragged onto.
  // Drag-time boost is layered on top of this in the render output.
  const [persistedZ, setPersistedZ] = useState(BASE_Z)
  // Mirror of `pos` accessible synchronously from gesture callbacks.
  // setPos batches asynchronously, so onUp can't read the latest pos
  // through the React state directly; this ref always holds whatever
  // value onMove last computed. Updated alongside setPos so they
  // never drift.
  const latestPosRef = useRef<DragPos>(pos)

  // Keep latest props in refs so the gesture callbacks (captured at
  // press time, used over many motion events) read fresh values without
  // forcing re-creation of the callback on every prop change.
  const onDragStartRef = useRef(onDragStart)
  const onDragRef = useRef(onDrag)
  const onDragEndRef = useRef(onDragEnd)
  const boundsRef = useRef(bounds)
  const dragDataRef = useRef(dragData)
  onDragStartRef.current = onDragStart
  onDragRef.current = onDrag
  onDragEndRef.current = onDragEnd
  boundsRef.current = bounds
  dragDataRef.current = dragData

  // boxWidth/boxHeight needed for bounds clamping. Drawn from props each
  // render so a hot-resize during drag clamps to the new size on the
  // next motion event.
  const widthRef = useRef<number | undefined>(
    typeof boxProps.width === 'number' ? boxProps.width : undefined,
  )
  const heightRef = useRef<number | undefined>(
    typeof boxProps.height === 'number' ? boxProps.height : undefined,
  )
  widthRef.current = typeof boxProps.width === 'number' ? boxProps.width : undefined
  heightRef.current = typeof boxProps.height === 'number' ? boxProps.height : undefined

  const handleMouseDown = useCallback(
    (e: MouseDownEvent): void => {
      handleDragPress(e, {
        startPos: pos,
        disabled,
        boundsRef,
        widthRef,
        heightRef,
        latestPosRef,
        setPos,
        setIsDragging,
        setPersistedZ,
        onDragStartRef,
        onDragRef,
        onDragEndRef,
        dragDataRef,
      })
    },
    [pos, disabled],
  )

  return (
    <Box
      {...boxProps}
      position="absolute"
      top={pos.top}
      left={pos.left}
      zIndex={isDragging ? persistedZ + DRAG_Z_BOOST : persistedZ}
      onMouseDown={handleMouseDown}
    />
  )
}

// ── gesture handler (extracted so tests can drive it without React) ──

/**
 * Inputs the press handler needs from the React component. Refs are
 * passed in so the extracted function reads them at gesture time —
 * matches the original inline behavior where each onMove read the
 * latest bounds/size/callbacks from refs filled in on every render.
 */
type DragPressDeps = {
  startPos: DragPos
  disabled: boolean | undefined
  boundsRef: { current: DragBounds | undefined }
  widthRef: { current: number | undefined }
  heightRef: { current: number | undefined }
  latestPosRef: { current: DragPos }
  setPos: (p: DragPos) => void
  setIsDragging: (d: boolean) => void
  setPersistedZ: (n: number) => void
  onDragStartRef: { current: ((info: DragInfo) => void) | undefined }
  onDragRef: { current: ((info: DragInfo) => void) | undefined }
  onDragEndRef: { current: ((info: DragInfo) => void) | undefined }
  /** Latest `dragData` prop, payload forwarded to drop targets. */
  dragDataRef: { current: unknown }
}

/**
 * Implements the press → motion → release lifecycle. Public via the
 * component's `onMouseDown`; exported here so tests can call it with
 * stub setters and drive the captured gesture handlers directly,
 * without spinning up React or Ink.
 */
export function handleDragPress(e: MouseDownEvent, deps: DragPressDeps): void {
  if (deps.disabled) return
  // Snapshot at press: where the box was, where the cursor was.
  // The drag math = startPos + (cursor - startCursor), so the grabbed
  // point stays under the cursor as the box moves.
  const startPos = deps.startPos
  const startCol = e.col
  const startRow = e.row
  // Defer onDragStart until first motion. A press without motion is not
  // a drag — letting subscribers distinguish hold-and-release from
  // drag-and-drop.
  let dragStarted = false

  // Bump persisted z immediately on press. Even if no drag follows,
  // pressing communicates "I'm interacting with this box" — raising it
  // above siblings is the right affordance.
  deps.setPersistedZ(takeNextZ())

  e.captureGesture({
    onMove(m: MouseMoveEvent) {
      const dx = m.col - startCol
      const dy = m.row - startRow
      const newPos = computeDraggedPos(
        startPos,
        startCol,
        startRow,
        m.col,
        m.row,
        deps.boundsRef.current,
        deps.widthRef.current,
        deps.heightRef.current,
      )
      if (!dragStarted) {
        dragStarted = true
        deps.setIsDragging(true)
        // Engage drop-target tracking on the SAME event we treat as
        // drag-start. startDrag must come before onDragStart fires so
        // user code in onDragStart can already query isDragActive() if
        // it needs to (rare, but consistent ordering matters).
        startDrag(deps.dragDataRef.current)
        deps.onDragStartRef.current?.({ pos: newPos, startPos, delta: { dx, dy } })
      }
      deps.latestPosRef.current = newPos
      deps.setPos(newPos)
      deps.onDragRef.current?.({ pos: newPos, startPos, delta: { dx, dy } })
      // Tick AFTER setPos / onDrag so drop-target callbacks see the box
      // already at its new position when they read from refs / state.
      tickDrag(m.col, m.row)
    },
    onUp(u: MouseUpEvent) {
      if (!dragStarted) return
      deps.setIsDragging(false)
      // dispatchDrop walks the registered targets and fires onDrop on
      // the topmost containing one. Returns whether anyone took it so
      // the source can react (e.g. snap back if no target accepted).
      const dropped = dispatchDrop(u.col, u.row)
      // endDrag must come AFTER dispatchDrop — it clears the active drag,
      // and dispatchDrop reads activeDrag.data to populate the DropInfo.
      endDrag()
      // The position the user SEES at release is whatever onMove last
      // committed — read straight from the ref so onDragEnd matches the
      // rendered state exactly, even if bounds or size shifted between
      // the last motion and release.
      const finalPos = deps.latestPosRef.current
      deps.onDragEndRef.current?.({
        pos: finalPos,
        startPos,
        delta: { dx: u.col - startCol, dy: u.row - startRow },
        dropped,
      })
    },
  })
}

// ── helpers (exported for testing; keep behavior here pure) ───────────

/**
 * Clamp `value` to `[min, max]` inclusive. When max < min (degenerate
 * bounds — e.g. parent smaller than the draggable), returns min so the
 * draggable pins to the top/left rather than getting an inverted range.
 * Local rather than reusing layout/geometry's clamp because that one
 * doesn't define behavior for inverted ranges; this one does, and the
 * draggable's bounds clamp DOES hit that case (mount inside a too-small
 * parent during transient layout shifts).
 */
function clampRange(value: number, min: number, max: number): number {
  if (max < min) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/**
 * Compute the new (top, left) for a draggable given a start pos, the
 * cursor's start cell, the cursor's current cell, and optional bounds +
 * box size. Pure — drives both the live drag math and tests.
 */
export function computeDraggedPos(
  startPos: DragPos,
  startCol: number,
  startRow: number,
  curCol: number,
  curRow: number,
  bounds?: DragBounds,
  boxWidth?: number,
  boxHeight?: number,
): DragPos {
  let top = startPos.top + (curRow - startRow)
  let left = startPos.left + (curCol - startCol)
  if (bounds && typeof boxWidth === 'number' && typeof boxHeight === 'number') {
    top = clampRange(top, 0, bounds.height - boxHeight)
    left = clampRange(left, 0, bounds.width - boxWidth)
  }
  return { top, left }
}

// ── module-scope z-index counter ─────────────────────────────────────

/**
 * Base z-index for a freshly-mounted draggable. Picked above 1 so a
 * draggable paints over a typical container with `zIndex={1}` (the
 * idiomatic "this box wraps draggables" pattern in our demos).
 */
const BASE_Z = 10

/**
 * How much higher to paint a draggable WHILE its drag is in progress.
 * Large enough that even after many siblings have bumped their persisted
 * z via raise-on-press, the actively-dragged box still wins paint order
 * (a thousand presses without a re-mount is well past any realistic UX).
 */
const DRAG_Z_BOOST = 1000

let nextZ = BASE_Z
function takeNextZ(): number {
  nextZ += 1
  return nextZ
}

/**
 * Reset the raise-on-press counter. Internal/test use only — not part
 * of the public API. Useful for deterministic snapshots; the demos
 * never need this.
 *
 * @internal
 */
export function _resetDraggableZForTesting(): void {
  nextZ = BASE_Z
}
