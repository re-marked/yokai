/**
 * Draggable component tests.
 *
 * Two tiers of coverage:
 *
 *   1. **Pure-math** tests for `computeDraggedPos` — the cell-arithmetic
 *      that drives every drag motion. Covered exhaustively here so any
 *      regression in the offset/clamp math is caught without spinning
 *      up React.
 *
 *   2. **Gesture-protocol** tests that drive `handleDragPress` directly
 *      with stub setters and capture the gesture handlers it installs
 *      on the MouseDownEvent. This skips React's render loop deliberately
 *      — what we're testing is the press → motion → release contract,
 *      not React's reconciler. The component's only job is wiring this
 *      function to useState/useRef, which the demos exercise live.
 */

import { describe, expect, it, vi } from 'vitest'
import { MouseDownEvent, MouseMoveEvent, MouseUpEvent } from '../events/mouse-event.js'
import {
  type DragBounds,
  type DragInfo,
  type DragPos,
  _resetDraggableZForTesting,
  computeDraggedPos,
  handleDragPress,
} from './Draggable.js'

// ── pure math ────────────────────────────────────────────────────────

describe('computeDraggedPos', () => {
  it('returns the start position when cursor has not moved', () => {
    const startPos = { top: 5, left: 10 }
    expect(computeDraggedPos(startPos, 20, 30, 20, 30)).toEqual({ top: 5, left: 10 })
  })

  it('translates by the cursor delta when unbounded', () => {
    expect(computeDraggedPos({ top: 5, left: 10 }, 20, 30, 23, 32)).toEqual({
      top: 7,
      left: 13,
    })
  })

  it('handles negative deltas (drag up-left)', () => {
    expect(computeDraggedPos({ top: 5, left: 10 }, 20, 30, 18, 27)).toEqual({
      top: 2,
      left: 8,
    })
  })

  it('clamps top within bounds when bounds + size are supplied', () => {
    // Drag past the bottom: bounds.height=10, box.height=3 → max top=7.
    expect(
      computeDraggedPos({ top: 0, left: 0 }, 0, 0, 0, 15, { width: 20, height: 10 }, 5, 3),
    ).toEqual({ top: 7, left: 0 })
  })

  it('clamps left within bounds when bounds + size are supplied', () => {
    // Drag past the right: bounds.width=20, box.width=5 → max left=15.
    expect(
      computeDraggedPos({ top: 0, left: 0 }, 0, 0, 30, 0, { width: 20, height: 10 }, 5, 3),
    ).toEqual({ top: 0, left: 15 })
  })

  it('clamps to zero when dragged past the top-left edge', () => {
    expect(
      computeDraggedPos({ top: 0, left: 0 }, 0, 0, -10, -10, { width: 20, height: 10 }, 5, 3),
    ).toEqual({ top: 0, left: 0 })
  })

  it('does not clamp when bounds is omitted (free drag)', () => {
    expect(computeDraggedPos({ top: 0, left: 0 }, 0, 0, -100, -100)).toEqual({
      top: -100,
      left: -100,
    })
  })

  it('does not clamp when only width is supplied (no bounds)', () => {
    // Bounds requires BOTH dims and a width/height — partial info → no clamp.
    expect(computeDraggedPos({ top: 0, left: 0 }, 0, 0, 100, 100, undefined, 5, 3)).toEqual({
      top: 100,
      left: 100,
    })
  })

  it('returns top-left zero when bounds smaller than the box (degenerate)', () => {
    // box 10x5 inside 5x3 bounds — max top/left would be negative; clamp pins at 0.
    expect(
      computeDraggedPos({ top: 0, left: 0 }, 0, 0, 50, 50, { width: 5, height: 3 }, 10, 5),
    ).toEqual({ top: 0, left: 0 })
  })
})

// ── gesture-protocol ─────────────────────────────────────────────────

/** Build a stub deps object so each test can drive handleDragPress
 *  in isolation. setters are vi.fn() so tests can assert call counts;
 *  refs start with the values typically supplied by useRef in the
 *  component (latest props at press time). */
function makeDeps(
  opts: {
    startPos?: DragPos
    bounds?: DragBounds
    width?: number
    height?: number
    disabled?: boolean
    onDragStart?: (info: DragInfo) => void
    onDrag?: (info: DragInfo) => void
    onDragEnd?: (info: DragInfo) => void
  } = {},
): Parameters<typeof handleDragPress>[1] & {
  setPos: ReturnType<typeof vi.fn>
  setIsDragging: ReturnType<typeof vi.fn>
  setPersistedZ: ReturnType<typeof vi.fn>
  latestPosRef: { current: DragPos }
} {
  const startPos = opts.startPos ?? { top: 0, left: 0 }
  return {
    startPos,
    disabled: opts.disabled,
    boundsRef: { current: opts.bounds },
    widthRef: { current: opts.width },
    heightRef: { current: opts.height },
    latestPosRef: { current: startPos },
    setPos: vi.fn(),
    setIsDragging: vi.fn(),
    setPersistedZ: vi.fn(),
    onDragStartRef: { current: opts.onDragStart },
    onDragRef: { current: opts.onDrag },
    onDragEndRef: { current: opts.onDragEnd },
  }
}

describe('handleDragPress', () => {
  it('captures a gesture on press', () => {
    _resetDraggableZForTesting()
    const e = new MouseDownEvent(5, 1, 0)
    handleDragPress(e, makeDeps())
    expect(e._capturedHandlers).not.toBeNull()
    expect(e._capturedHandlers?.onMove).toBeTypeOf('function')
    expect(e._capturedHandlers?.onUp).toBeTypeOf('function')
  })

  it('bumps persisted z on press, even with no motion', () => {
    _resetDraggableZForTesting()
    const e = new MouseDownEvent(5, 1, 0)
    const deps = makeDeps()
    handleDragPress(e, deps)
    expect(deps.setPersistedZ).toHaveBeenCalledTimes(1)
    // Subsequent press bumps strictly higher
    const e2 = new MouseDownEvent(5, 1, 0)
    const deps2 = makeDeps()
    handleDragPress(e2, deps2)
    const z1 = deps.setPersistedZ.mock.calls[0]![0] as number
    const z2 = deps2.setPersistedZ.mock.calls[0]![0] as number
    expect(z2).toBeGreaterThan(z1)
  })

  it('does NOT capture a gesture when disabled', () => {
    _resetDraggableZForTesting()
    const e = new MouseDownEvent(5, 1, 0)
    const deps = makeDeps({ disabled: true })
    handleDragPress(e, deps)
    expect(e._capturedHandlers).toBeNull()
    expect(deps.setPersistedZ).not.toHaveBeenCalled()
  })

  it('does NOT fire onDragStart on press alone', () => {
    _resetDraggableZForTesting()
    const onDragStart = vi.fn()
    const e = new MouseDownEvent(5, 1, 0)
    handleDragPress(e, makeDeps({ onDragStart }))
    expect(onDragStart).not.toHaveBeenCalled()
  })

  it('fires onDragStart on the FIRST motion event with start + delta', () => {
    _resetDraggableZForTesting()
    const onDragStart = vi.fn()
    const e = new MouseDownEvent(15, 6, 0)
    handleDragPress(
      e,
      makeDeps({ startPos: { top: 5, left: 10 }, onDragStart, width: 10, height: 3 }),
    )
    e._capturedHandlers!.onMove!(new MouseMoveEvent(17, 7, 0))
    expect(onDragStart).toHaveBeenCalledTimes(1)
    expect(onDragStart).toHaveBeenCalledWith({
      pos: { top: 6, left: 12 },
      startPos: { top: 5, left: 10 },
      delta: { dx: 2, dy: 1 },
    })
  })

  it('fires onDragStart only ONCE across many motion events', () => {
    _resetDraggableZForTesting()
    const onDragStart = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleDragPress(e, makeDeps({ onDragStart }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(1, 0, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(2, 0, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(3, 0, 0))
    expect(onDragStart).toHaveBeenCalledTimes(1)
  })

  it('fires onDrag on each motion event', () => {
    _resetDraggableZForTesting()
    const onDrag = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleDragPress(e, makeDeps({ onDrag }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(1, 0, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(2, 0, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(3, 1, 0))
    expect(onDrag).toHaveBeenCalledTimes(3)
    expect(onDrag).toHaveBeenLastCalledWith({
      pos: { top: 1, left: 3 },
      startPos: { top: 0, left: 0 },
      delta: { dx: 3, dy: 1 },
    })
  })

  it('updates setPos on every motion (so the rendered pos tracks the cursor)', () => {
    _resetDraggableZForTesting()
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps()
    handleDragPress(e, deps)
    e._capturedHandlers!.onMove!(new MouseMoveEvent(5, 2, 0))
    expect(deps.setPos).toHaveBeenLastCalledWith({ top: 2, left: 5 })
    e._capturedHandlers!.onMove!(new MouseMoveEvent(8, 3, 0))
    expect(deps.setPos).toHaveBeenLastCalledWith({ top: 3, left: 8 })
  })

  it('flips isDragging true on first motion and false on release', () => {
    _resetDraggableZForTesting()
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps()
    handleDragPress(e, deps)
    expect(deps.setIsDragging).not.toHaveBeenCalled()
    e._capturedHandlers!.onMove!(new MouseMoveEvent(1, 0, 0))
    expect(deps.setIsDragging).toHaveBeenLastCalledWith(true)
    e._capturedHandlers!.onUp!(new MouseUpEvent(1, 0, 0))
    expect(deps.setIsDragging).toHaveBeenLastCalledWith(false)
  })

  it('fires onDragEnd at release with the final visible pos', () => {
    _resetDraggableZForTesting()
    const onDragEnd = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleDragPress(e, makeDeps({ onDragEnd }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(5, 2, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(8, 3, 0))
    e._capturedHandlers!.onUp!(new MouseUpEvent(8, 3, 0))
    expect(onDragEnd).toHaveBeenCalledTimes(1)
    expect(onDragEnd).toHaveBeenCalledWith({
      pos: { top: 3, left: 8 },
      startPos: { top: 0, left: 0 },
      delta: { dx: 8, dy: 3 },
    })
  })

  it('does NOT fire onDragEnd on release if no motion happened', () => {
    _resetDraggableZForTesting()
    const onDragEnd = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleDragPress(e, makeDeps({ onDragEnd }))
    e._capturedHandlers!.onUp!(new MouseUpEvent(0, 0, 0))
    expect(onDragEnd).not.toHaveBeenCalled()
  })

  it('does NOT flip isDragging false on release if no drag happened', () => {
    _resetDraggableZForTesting()
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps()
    handleDragPress(e, deps)
    e._capturedHandlers!.onUp!(new MouseUpEvent(0, 0, 0))
    expect(deps.setIsDragging).not.toHaveBeenCalled()
  })

  it('clamps motion to bounds when supplied', () => {
    _resetDraggableZForTesting()
    const onDrag = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleDragPress(
      e,
      makeDeps({
        bounds: { width: 20, height: 10 },
        width: 5,
        height: 3,
        onDrag,
      }),
    )
    e._capturedHandlers!.onMove!(new MouseMoveEvent(100, 100, 0))
    // Max valid top = 10 - 3 = 7; max valid left = 20 - 5 = 15.
    expect(onDrag).toHaveBeenLastCalledWith({
      pos: { top: 7, left: 15 },
      startPos: { top: 0, left: 0 },
      delta: { dx: 100, dy: 100 },
    })
  })

  it('reads bounds from the ref at gesture time (so mid-drag bounds changes apply)', () => {
    _resetDraggableZForTesting()
    const onDrag = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps({
      bounds: { width: 20, height: 10 },
      width: 5,
      height: 3,
      onDrag,
    })
    handleDragPress(e, deps)
    // First motion with original bounds (clamped to 15, 7).
    e._capturedHandlers!.onMove!(new MouseMoveEvent(100, 100, 0))
    expect(onDrag).toHaveBeenLastCalledWith(expect.objectContaining({ pos: { top: 7, left: 15 } }))
    // Now shrink bounds mid-drag — next motion should clamp to the new max.
    deps.boundsRef.current = { width: 10, height: 5 }
    e._capturedHandlers!.onMove!(new MouseMoveEvent(100, 100, 0))
    // Max now: top = 5 - 3 = 2; left = 10 - 5 = 5.
    expect(onDrag).toHaveBeenLastCalledWith(expect.objectContaining({ pos: { top: 2, left: 5 } }))
  })

  it('does NOT fire onUp from a captured gesture when disabled (no gesture captured)', () => {
    _resetDraggableZForTesting()
    const onDragEnd = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleDragPress(e, makeDeps({ disabled: true, onDragEnd }))
    // No gesture captured → no onUp to call. Sanity-check the contract.
    expect(e._capturedHandlers).toBeNull()
    expect(onDragEnd).not.toHaveBeenCalled()
  })
})
