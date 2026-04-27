/**
 * Resizable component tests.
 *
 * Same two-tier shape as Draggable.test.tsx:
 *
 *   1. Pure-math tests for `computeResizedSize` — covers every direction,
 *      clamping in both axes, degenerate min/max, default min.
 *   2. Gesture-protocol tests that drive `handleResizePress` directly
 *      with stub setters and capture the gesture handlers it installs
 *      on the MouseDownEvent. Skips React's render loop so the press
 *      → motion → release contract is the only thing under test.
 */

import { describe, expect, it, vi } from 'vitest'
import { MouseDownEvent, MouseMoveEvent, MouseUpEvent } from '../events/mouse-event.js'
import {
  type ResizeHandleDirection,
  type ResizeInfo,
  type ResizeSize,
  computeResizedSize,
  handleResizePress,
} from './Resizable.js'

// ── pure math ────────────────────────────────────────────────────────

describe('computeResizedSize', () => {
  it('returns the start size when cursor has not moved', () => {
    const start = { width: 20, height: 5 }
    expect(computeResizedSize(start, 0, 0, 0, 0, 'se')).toEqual({ width: 20, height: 5 })
  })

  it('grows only width on direction "e"', () => {
    expect(computeResizedSize({ width: 10, height: 5 }, 0, 0, 5, 3, 'e')).toEqual({
      width: 15,
      height: 5,
    })
  })

  it('grows only height on direction "s"', () => {
    expect(computeResizedSize({ width: 10, height: 5 }, 0, 0, 5, 3, 's')).toEqual({
      width: 10,
      height: 8,
    })
  })

  it('grows both dimensions on direction "se"', () => {
    expect(computeResizedSize({ width: 10, height: 5 }, 0, 0, 5, 3, 'se')).toEqual({
      width: 15,
      height: 8,
    })
  })

  it('shrinks when cursor moves opposite direction (negative delta)', () => {
    expect(computeResizedSize({ width: 20, height: 10 }, 5, 5, 2, 3, 'se')).toEqual({
      width: 17,
      height: 8,
    })
  })

  it('clamps to min width (defaults to 1)', () => {
    // Drag way past the left → would shrink to negative; clamp to default 1.
    expect(computeResizedSize({ width: 5, height: 5 }, 10, 10, 0, 10, 'e')).toEqual({
      width: 1,
      height: 5,
    })
  })

  it('clamps to min height (defaults to 1)', () => {
    expect(computeResizedSize({ width: 5, height: 5 }, 10, 10, 10, 0, 's')).toEqual({
      width: 5,
      height: 1,
    })
  })

  it('respects user-supplied minSize', () => {
    expect(
      computeResizedSize({ width: 20, height: 10 }, 0, 0, -100, -100, 'se', {
        width: 5,
        height: 3,
      }),
    ).toEqual({ width: 5, height: 3 })
  })

  it('respects user-supplied maxSize', () => {
    expect(
      computeResizedSize({ width: 5, height: 5 }, 0, 0, 100, 100, 'se', undefined, {
        width: 20,
        height: 10,
      }),
    ).toEqual({ width: 20, height: 10 })
  })

  it('clamps each axis independently', () => {
    // Width hits max, height stays in range.
    expect(
      computeResizedSize({ width: 5, height: 5 }, 0, 0, 100, 3, 'se', undefined, {
        width: 20,
        height: 50,
      }),
    ).toEqual({ width: 20, height: 8 })
  })

  it('returns min when max < min (degenerate bounds)', () => {
    expect(
      computeResizedSize(
        { width: 10, height: 10 },
        0,
        0,
        50,
        50,
        'se',
        { width: 20, height: 20 },
        { width: 5, height: 5 },
      ),
    ).toEqual({ width: 20, height: 20 })
  })

  it('does not change height on direction "e" even with row delta', () => {
    expect(computeResizedSize({ width: 10, height: 5 }, 0, 0, 5, 99, 'e')).toEqual({
      width: 15,
      height: 5,
    })
  })

  it('does not change width on direction "s" even with col delta', () => {
    expect(computeResizedSize({ width: 10, height: 5 }, 0, 0, 99, 3, 's')).toEqual({
      width: 10,
      height: 8,
    })
  })
})

// ── gesture-protocol ─────────────────────────────────────────────────

function makeDeps(
  opts: {
    startSize?: ResizeSize
    minSize?: ResizeSize
    maxSize?: ResizeSize
    onResizeStart?: (info: ResizeInfo) => void
    onResize?: (info: ResizeInfo) => void
    onResizeEnd?: (info: ResizeInfo) => void
  } = {},
): Parameters<typeof handleResizePress>[2] & {
  setSize: ReturnType<typeof vi.fn>
  latestSizeRef: { current: ResizeSize }
} {
  const startSize = opts.startSize ?? { width: 10, height: 5 }
  return {
    startSize,
    minSizeRef: { current: opts.minSize },
    maxSizeRef: { current: opts.maxSize },
    latestSizeRef: { current: startSize },
    setSize: vi.fn(),
    onResizeStartRef: { current: opts.onResizeStart },
    onResizeRef: { current: opts.onResize },
    onResizeEndRef: { current: opts.onResizeEnd },
  }
}

describe('handleResizePress', () => {
  it('captures a gesture on press', () => {
    const e = new MouseDownEvent(10, 5, 0)
    handleResizePress(e, 'se', makeDeps())
    expect(e._capturedHandlers).not.toBeNull()
    expect(e._capturedHandlers?.onMove).toBeTypeOf('function')
    expect(e._capturedHandlers?.onUp).toBeTypeOf('function')
  })

  it('does NOT fire onResizeStart on press alone', () => {
    const onResizeStart = vi.fn()
    const e = new MouseDownEvent(10, 5, 0)
    handleResizePress(e, 'se', makeDeps({ onResizeStart }))
    expect(onResizeStart).not.toHaveBeenCalled()
  })

  it('fires onResizeStart on the FIRST motion event with new size + direction', () => {
    const onResizeStart = vi.fn()
    const e = new MouseDownEvent(10, 5, 0)
    handleResizePress(e, 'se', makeDeps({ startSize: { width: 10, height: 5 }, onResizeStart }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(13, 7, 0))
    expect(onResizeStart).toHaveBeenCalledTimes(1)
    expect(onResizeStart).toHaveBeenCalledWith({
      size: { width: 13, height: 7 },
      startSize: { width: 10, height: 5 },
      delta: { dw: 3, dh: 2 },
      direction: 'se',
    })
  })

  it('fires onResizeStart only ONCE across many motion events', () => {
    const onResizeStart = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleResizePress(e, 'se', makeDeps({ onResizeStart }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(1, 1, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(2, 2, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(3, 3, 0))
    expect(onResizeStart).toHaveBeenCalledTimes(1)
  })

  it('fires onResize on each motion event', () => {
    const onResize = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleResizePress(e, 'se', makeDeps({ onResize }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(1, 0, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(2, 1, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(3, 2, 0))
    expect(onResize).toHaveBeenCalledTimes(3)
  })

  it('updates setSize on every motion (so the rendered size tracks the cursor)', () => {
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps({ startSize: { width: 10, height: 5 } })
    handleResizePress(e, 'se', deps)
    e._capturedHandlers!.onMove!(new MouseMoveEvent(5, 2, 0))
    expect(deps.setSize).toHaveBeenLastCalledWith({ width: 15, height: 7 })
    e._capturedHandlers!.onMove!(new MouseMoveEvent(8, 3, 0))
    expect(deps.setSize).toHaveBeenLastCalledWith({ width: 18, height: 8 })
  })

  it('only updates width when direction is "e"', () => {
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps({ startSize: { width: 10, height: 5 } })
    handleResizePress(e, 'e', deps)
    e._capturedHandlers!.onMove!(new MouseMoveEvent(5, 99, 0))
    expect(deps.setSize).toHaveBeenLastCalledWith({ width: 15, height: 5 })
  })

  it('only updates height when direction is "s"', () => {
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps({ startSize: { width: 10, height: 5 } })
    handleResizePress(e, 's', deps)
    e._capturedHandlers!.onMove!(new MouseMoveEvent(99, 3, 0))
    expect(deps.setSize).toHaveBeenLastCalledWith({ width: 10, height: 8 })
  })

  it('fires onResizeEnd at release with the final visible size and direction', () => {
    const onResizeEnd = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleResizePress(e, 'se', makeDeps({ onResizeEnd }))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(5, 2, 0))
    e._capturedHandlers!.onMove!(new MouseMoveEvent(8, 3, 0))
    e._capturedHandlers!.onUp!(new MouseUpEvent(8, 3, 0))
    expect(onResizeEnd).toHaveBeenCalledTimes(1)
    expect(onResizeEnd).toHaveBeenCalledWith({
      size: { width: 18, height: 8 },
      startSize: { width: 10, height: 5 },
      delta: { dw: 8, dh: 3 },
      direction: 'se',
    })
  })

  it('does NOT fire onResizeEnd on release if no motion happened', () => {
    const onResizeEnd = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleResizePress(e, 'se', makeDeps({ onResizeEnd }))
    e._capturedHandlers!.onUp!(new MouseUpEvent(0, 0, 0))
    expect(onResizeEnd).not.toHaveBeenCalled()
  })

  it('clamps to minSize during motion', () => {
    const onResize = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleResizePress(
      e,
      'se',
      makeDeps({
        startSize: { width: 10, height: 5 },
        minSize: { width: 5, height: 3 },
        onResize,
      }),
    )
    // Drag way past the top-left → clamp to (5, 3).
    e._capturedHandlers!.onMove!(new MouseMoveEvent(-100, -100, 0))
    expect(onResize).toHaveBeenLastCalledWith({
      size: { width: 5, height: 3 },
      startSize: { width: 10, height: 5 },
      delta: { dw: -100, dh: -100 },
      direction: 'se',
    })
  })

  it('clamps to maxSize during motion', () => {
    const onResize = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    handleResizePress(
      e,
      'se',
      makeDeps({
        startSize: { width: 10, height: 5 },
        maxSize: { width: 20, height: 12 },
        onResize,
      }),
    )
    e._capturedHandlers!.onMove!(new MouseMoveEvent(1000, 1000, 0))
    expect(onResize).toHaveBeenLastCalledWith({
      size: { width: 20, height: 12 },
      startSize: { width: 10, height: 5 },
      delta: { dw: 1000, dh: 1000 },
      direction: 'se',
    })
  })

  it('reads min/max from refs at gesture time (so mid-resize bounds changes apply)', () => {
    const onResize = vi.fn()
    const e = new MouseDownEvent(0, 0, 0)
    const deps = makeDeps({
      startSize: { width: 10, height: 5 },
      maxSize: { width: 20, height: 12 },
      onResize,
    })
    handleResizePress(e, 'se', deps)
    e._capturedHandlers!.onMove!(new MouseMoveEvent(100, 100, 0))
    expect(onResize).toHaveBeenLastCalledWith(
      expect.objectContaining({ size: { width: 20, height: 12 } }),
    )
    // Tighten max mid-resize.
    deps.maxSizeRef.current = { width: 15, height: 8 }
    e._capturedHandlers!.onMove!(new MouseMoveEvent(100, 100, 0))
    expect(onResize).toHaveBeenLastCalledWith(
      expect.objectContaining({ size: { width: 15, height: 8 } }),
    )
  })

  it('handles every direction correctly in one gesture lifecycle', () => {
    // Spot-check that direction stays consistent across the whole gesture
    // — the press captures it; subsequent motions don't get to change it.
    const onResize = vi.fn()
    const dirs: ResizeHandleDirection[] = ['e', 's', 'se']
    for (const dir of dirs) {
      onResize.mockReset()
      const e = new MouseDownEvent(0, 0, 0)
      handleResizePress(e, dir, makeDeps({ onResize }))
      e._capturedHandlers!.onMove!(new MouseMoveEvent(5, 5, 0))
      expect(onResize).toHaveBeenCalledWith(expect.objectContaining({ direction: dir }))
    }
  })
})
