import type React from 'react'
import { type PropsWithChildren, useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../dom.js'
import type { MouseDownEvent, MouseMoveEvent, MouseUpEvent } from '../events/mouse-event.js'
import type { Color } from '../styles.js'
import Box, { type Props as BoxProps } from './Box.js'
import Text from './Text.js'

/** Cell-grid size. width/height are integer cell counts. */
export type ResizeSize = { width: number; height: number }

/** Which edges/corners can be grabbed to resize. v1 supports the
 *  bottom-right family — `s` (south, bottom edge), `e` (east, right
 *  edge), `se` (south-east corner). All three grow the box outward
 *  toward the bottom-right; the box's top-left stays put.
 *
 *  North / west / NW / SW / NE handles aren't supported in v1 because
 *  resizing those edges shifts the layout origin, which fights flexbox
 *  in non-obvious ways for in-flow components. They're a clean follow-up
 *  for absolute-positioned Resizables. */
export type ResizeHandleDirection = 's' | 'e' | 'se'

/** Lifecycle payload passed to onResize callbacks. `delta` is total
 *  cell delta from the resize start point — not from the previous
 *  motion event. */
export type ResizeInfo = {
  size: ResizeSize
  startSize: ResizeSize
  delta: { dw: number; dh: number }
  /** Which handle the user grabbed (`s`, `e`, or `se`). Useful when
   *  the same callback handles multiple handles. */
  direction: ResizeHandleDirection
}

export type ResizableProps = Except<BoxProps, 'width' | 'height' | 'onMouseDown'> & {
  /** Cell dimensions before the user resizes. Internal state seeds from
   *  this on mount; subsequent renders use the resized dimensions.
   *  Changing this prop after mount is ignored — `defaultValue` semantics. */
  initialSize: ResizeSize
  /** Lower bound on size. Default `{ width: 1, height: 1 }` (the smallest
   *  meaningful box). User-supplied min wins over the default — pass e.g.
   *  `{ width: 10, height: 3 }` to keep the resizable at least the size
   *  of an inner control. */
  minSize?: ResizeSize
  /** Upper bound on size. Optional — when omitted the box can grow
   *  unbounded (in practice, until it overflows its container or the
   *  terminal). Pass e.g. `{ width: cols, height: rows }` to clamp at the
   *  terminal viewport. */
  maxSize?: ResizeSize
  /** Which handles to render. Default `['se']` — bottom-right corner only,
   *  the common case for resizable panels. Pass `['s', 'e', 'se']` for
   *  three independent handles, or any subset. */
  handles?: ResizeHandleDirection[]
  /** Background color of the handle when idle. Visible chrome so the user
   *  knows where to grab. Default `'gray'`. */
  handleColor?: Color
  /** Background color of the handle when the cursor is over it. Hover
   *  affordance. Default `'white'`. */
  handleHoverColor?: Color
  /**
   * When true (default), the box's effective minimum height tracks its
   * content's natural height — i.e. you cannot shrink the box smaller
   * than the space its content needs to display. As the user shrinks
   * the WIDTH (text wraps into more lines), the box auto-grows in
   * HEIGHT to accommodate. The `minSize.height` you pass still applies
   * as a FLOOR; the effective minimum is `max(minSize.height,
   * contentNaturalHeight)`.
   *
   * Set to false to opt out — the box will accept any minSize down to
   * (1, 1) and clip overflowing content. Useful when the content is
   * itself scrollable / virtualised and the user wants raw size
   * control.
   */
  autoFit?: boolean
  /** Fires once at the FIRST motion of a resize (not on press). A press
   *  on a handle without subsequent motion is not a resize, so this won't
   *  fire — symmetrical with Draggable's onDragStart. */
  onResizeStart?: (info: ResizeInfo) => void
  /** Fires on every cell-crossing motion event during the resize. */
  onResize?: (info: ResizeInfo) => void
  /** Fires once at release if the gesture became a resize. */
  onResizeEnd?: (info: ResizeInfo) => void
}

/**
 * Resizable container. Wraps a `<Box>`; renders one or more grab handles
 * along its bottom / right / SE-corner edges; updates its own size as
 * the user drags those handles.
 *
 * What's baked in:
 *
 * - **Visible handle chrome** — a 1-cell strip on each enabled edge,
 *   plus a 1×1 corner marker for SE (with a `◢` glyph for clarity).
 *   Brightens on hover so the user can see the affordance.
 * - **Min/max clamping** — `minSize` defaults to (1, 1); `maxSize` is
 *   optional and unbounded by default. Both are respected at every
 *   motion event, not just at release.
 * - **Lifecycle separation** — `onResizeStart` is deferred to the first
 *   motion (a press without motion isn't a resize). `onResizeEnd` only
 *   fires if the gesture actually became a resize.
 * - **Handle isolation** — each handle calls `stopImmediatePropagation`
 *   on its mousedown, so a Resizable nested inside a Draggable won't
 *   start a drag when the user grabs a resize handle. Press anywhere
 *   ELSE on the Resizable still bubbles normally (clickable, draggable
 *   wrappers still work).
 *
 * v1 limitation: only south / east / SE handles. North / west / NW / SW /
 * NE are tricky for in-flow components (they shift the layout origin)
 * and are deferred to a follow-up.
 *
 * @example
 *   <Resizable
 *     initialSize={{ width: 30, height: 8 }}
 *     minSize={{ width: 10, height: 3 }}
 *     handles={['s', 'e', 'se']}
 *     borderStyle="single"
 *     onResizeEnd={({ size }) => persistPanelSize(size)}
 *   >
 *     <Text>I'm resizable.</Text>
 *   </Resizable>
 */
export default function Resizable({
  initialSize,
  minSize,
  maxSize,
  handles = ['se'],
  handleColor = 'gray',
  handleHoverColor = 'white',
  autoFit = true,
  onResizeStart,
  onResize,
  onResizeEnd,
  children,
  ...boxProps
}: PropsWithChildren<ResizableProps>): React.ReactNode {
  const [size, setSize] = useState<ResizeSize>(initialSize)
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandleDirection | null>(null)
  // Tracks the content's natural height for the current width (yoga's
  // computed height of the content wrapper, ignoring the box's height
  // constraint). Used as the effective minHeight when autoFit is on.
  // Starts at 0; first useLayoutEffect after mount fills it in.
  const [contentNaturalHeight, setContentNaturalHeight] = useState(0)
  // Ref to the inner content wrapper, queried by useLayoutEffect to read
  // its yoga-computed height.
  const contentRef = useRef<DOMElement>(null)

  // Refs read at gesture time so mid-resize prop changes apply on the
  // next motion event (mirrors Draggable's pattern).
  const onResizeStartRef = useRef(onResizeStart)
  const onResizeRef = useRef(onResize)
  const onResizeEndRef = useRef(onResizeEnd)
  const maxSizeRef = useRef(maxSize)
  onResizeStartRef.current = onResizeStart
  onResizeRef.current = onResize
  onResizeEndRef.current = onResizeEnd
  maxSizeRef.current = maxSize

  // Effective min: width from user (or default 1); height is the larger
  // of user-supplied min and the content's natural height when autoFit
  // is on. This is what the resize gesture clamps against, so the box
  // refuses to shrink past what its content needs to show.
  const effectiveMin: ResizeSize = {
    width: minSize?.width ?? 1,
    height: autoFit
      ? Math.max(minSize?.height ?? 1, contentNaturalHeight || 1)
      : (minSize?.height ?? 1),
  }
  const minSizeRef = useRef(effectiveMin)
  minSizeRef.current = effectiveMin

  // After every render, read the content wrapper's yoga-computed height.
  // Wrapper has no height constraint, so yoga gives it its content's
  // natural height for the wrapper's own width (which equals box width
  // via alignSelf:'stretch'). When that height differs from what we last
  // saw, update state — gated by equality so this isn't a render loop.
  useLayoutEffect(() => {
    if (!autoFit) return
    if (!contentRef.current?.yogaNode) return
    const h = contentRef.current.yogaNode.getComputedHeight()
    if (h > 0) {
      setContentNaturalHeight((prev) => (h !== prev ? h : prev))
    }
  })

  // Auto-grow size.height when content needs more than current height
  // can show. Pairs with the gesture's effectiveMin clamp to guarantee
  // the box never displays less than the full content. Fires both on
  // initial measurement (first render → useLayoutEffect → bump if
  // needed) and on width-driven re-wrap (text wraps tighter → more
  // lines → contentNaturalHeight grows → height bumps up to match).
  useLayoutEffect(() => {
    if (!autoFit) return
    if (size.height < effectiveMin.height) {
      setSize((s) => ({ ...s, height: effectiveMin.height }))
    }
  }, [autoFit, effectiveMin.height, size.height])

  // Mirror of `size` accessible synchronously from gesture callbacks
  // (setSize batches; onResizeEnd needs the latest committed size).
  const latestSizeRef = useRef<ResizeSize>(size)

  const startResize = useCallback(
    (e: MouseDownEvent, dir: ResizeHandleDirection): void => {
      // Stop propagation so a wrapping Draggable's onMouseDown doesn't
      // also fire and capture the gesture for itself. The handle's
      // captureGesture must win unambiguously.
      e.stopImmediatePropagation()
      handleResizePress(e, dir, {
        startSize: size,
        minSizeRef,
        maxSizeRef,
        latestSizeRef,
        setSize,
        onResizeStartRef,
        onResizeRef,
        onResizeEndRef,
      })
    },
    [size],
  )

  const handleE = useCallback((e: MouseDownEvent) => startResize(e, 'e'), [startResize])
  const handleS = useCallback((e: MouseDownEvent) => startResize(e, 's'), [startResize])
  const handleSe = useCallback((e: MouseDownEvent) => startResize(e, 'se'), [startResize])

  // Hover handlers: per-handle so leave only clears for the handle
  // that's actually exiting (multiple handles can be present, mouse
  // moving from one to the other should swap, not clear-and-clear).
  const enter = useCallback((dir: ResizeHandleDirection) => () => setHoveredHandle(dir), [])
  const leave = useCallback(
    (dir: ResizeHandleDirection) => () => setHoveredHandle((cur) => (cur === dir ? null : cur)),
    [],
  )

  const colorFor = (dir: ResizeHandleDirection): Color =>
    hoveredHandle === dir ? handleHoverColor : handleColor

  return (
    // overflow:'hidden' default protects against the auto-fit timing
    // gap (one frame between content growing and the box catching up)
    // AND against autoFit={false} cases where content is intentionally
    // larger than the box. Spread boxProps after our default so user
    // can override with `overflow:"visible"` for an opt-in bleed.
    <Box overflow="hidden" {...boxProps} width={size.width} height={size.height}>
      {/* Inner content wrapper exists solely so we have a stable yoga
          node to measure for autoFit. Default alignSelf in yoga is
          'auto' which inherits 'stretch' from the parent's column
          flex, so the wrapper takes the full box width — its measured
          natural height then reflects how content wraps at that width,
          which is the input we need for the auto-min calculation.
          Skipped measurement-wise when autoFit is false; the wrapper
          itself is harmless either way (no margins, no flex shrink). */}
      <Box ref={contentRef}>{children}</Box>
      {/* Handles are absolute children so they paint on top of content
          without affecting flex layout inside the Resizable. zIndex on
          SE > E,S so the corner cell paints over the edge strips when
          all three handles are enabled at once. */}
      {handles.includes('e') && (
        <Box
          position="absolute"
          top={0}
          left={size.width - 1}
          width={1}
          height={size.height}
          backgroundColor={colorFor('e')}
          onMouseDown={handleE}
          onMouseEnter={enter('e')}
          onMouseLeave={leave('e')}
          // Above sibling chrome but below the SE corner.
          zIndex={1}
        />
      )}
      {handles.includes('s') && (
        <Box
          position="absolute"
          top={size.height - 1}
          left={0}
          width={size.width}
          height={1}
          backgroundColor={colorFor('s')}
          onMouseDown={handleS}
          onMouseEnter={enter('s')}
          onMouseLeave={leave('s')}
          zIndex={1}
        />
      )}
      {handles.includes('se') && (
        <Box
          position="absolute"
          top={size.height - 1}
          left={size.width - 1}
          width={1}
          height={1}
          backgroundColor={colorFor('se')}
          onMouseDown={handleSe}
          onMouseEnter={enter('se')}
          onMouseLeave={leave('se')}
          // Above E and S so the corner cell wins paint when all three
          // are enabled (the E/S strips overlap the corner cell otherwise).
          zIndex={2}
        >
          <Text>◢</Text>
        </Box>
      )}
    </Box>
  )
}

// ── gesture handler (extracted so tests can drive it without React) ──

type ResizePressDeps = {
  startSize: ResizeSize
  minSizeRef: { current: ResizeSize | undefined }
  maxSizeRef: { current: ResizeSize | undefined }
  latestSizeRef: { current: ResizeSize }
  setSize: (s: ResizeSize) => void
  onResizeStartRef: { current: ((info: ResizeInfo) => void) | undefined }
  onResizeRef: { current: ((info: ResizeInfo) => void) | undefined }
  onResizeEndRef: { current: ((info: ResizeInfo) => void) | undefined }
}

/**
 * Implements the resize press → motion → release lifecycle. Used by
 * `<Resizable>` for each handle; exported here so tests can drive it
 * with stub setters and assert the contract without spinning up React.
 */
export function handleResizePress(
  e: MouseDownEvent,
  dir: ResizeHandleDirection,
  deps: ResizePressDeps,
): void {
  const startSize = deps.startSize
  const startCol = e.col
  const startRow = e.row
  // Defer onResizeStart to the first motion event. A press without
  // motion isn't a resize — symmetrical with Draggable.
  let resizeStarted = false

  e.captureGesture({
    onMove(m: MouseMoveEvent) {
      const dw = m.col - startCol
      const dh = m.row - startRow
      const newSize = computeResizedSize(
        startSize,
        startCol,
        startRow,
        m.col,
        m.row,
        dir,
        deps.minSizeRef.current,
        deps.maxSizeRef.current,
      )
      const info: ResizeInfo = { size: newSize, startSize, delta: { dw, dh }, direction: dir }
      if (!resizeStarted) {
        resizeStarted = true
        deps.onResizeStartRef.current?.(info)
      }
      deps.latestSizeRef.current = newSize
      deps.setSize(newSize)
      deps.onResizeRef.current?.(info)
    },
    onUp(u: MouseUpEvent) {
      if (!resizeStarted) return
      const finalSize = deps.latestSizeRef.current
      deps.onResizeEndRef.current?.({
        size: finalSize,
        startSize,
        delta: { dw: u.col - startCol, dh: u.row - startRow },
        direction: dir,
      })
    },
  })
}

// ── pure helpers (exported for testing) ──────────────────────────────

/**
 * Clamp `value` to `[min, max]` inclusive. When max < min (degenerate
 * bounds — e.g. minSize larger than maxSize), returns min so the
 * resize pins at the lower bound rather than producing an inverted
 * range. Local rather than reusing layout/geometry's clamp because
 * that one doesn't define behavior for inverted ranges.
 */
function clampRange(value: number, min: number, max: number): number {
  if (max < min) return min
  if (value < min) return min
  if (value > max) return max
  return value
}

/** Default minimum size when caller doesn't supply one. (1, 1) is the
 *  smallest meaningful box; smaller would mean "no visible chrome." */
const DEFAULT_MIN: ResizeSize = { width: 1, height: 1 }

/**
 * Compute the new size for a resize given the start size, cursor start +
 * current positions, the handle direction, and optional min/max bounds.
 * Pure — drives both the live resize math and tests.
 *
 * Direction semantics:
 *   - `e`  → only width changes (cursor delta in cols)
 *   - `s`  → only height changes (cursor delta in rows)
 *   - `se` → both change
 *
 * Each axis is clamped INDEPENDENTLY: dragging SE past max-width but
 * within max-height pins width and continues to grow height freely.
 */
export function computeResizedSize(
  startSize: ResizeSize,
  startCol: number,
  startRow: number,
  curCol: number,
  curRow: number,
  dir: ResizeHandleDirection,
  minSize?: ResizeSize,
  maxSize?: ResizeSize,
): ResizeSize {
  const min = minSize ?? DEFAULT_MIN
  let width = startSize.width
  let height = startSize.height
  if (dir === 'e' || dir === 'se') width = startSize.width + (curCol - startCol)
  if (dir === 's' || dir === 'se') height = startSize.height + (curRow - startRow)
  width = clampRange(width, min.width, maxSize?.width ?? Number.POSITIVE_INFINITY)
  height = clampRange(height, min.height, maxSize?.height ?? Number.POSITIVE_INFINITY)
  return { width, height }
}
