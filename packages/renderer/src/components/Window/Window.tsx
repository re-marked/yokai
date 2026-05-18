import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import type { Color } from '../../styles.js'
import Box from '../Box.js'
import { type DragBounds, type DragInfo, type DragPos, handleDragPress } from '../Draggable.js'
import {
  type ResizeHandleDirection,
  type ResizeInfo,
  type ResizeSize,
  handleResizePress,
} from '../Resizable.js'
import Surface from '../Surface/Surface.js'
import Text from '../Text.js'
import { WindowFocusContext } from './context.js'
import type { WindowFocusValue, WindowId, WindowProps, WindowRect } from './types.js'
import { claimWindowFocus, registerWindow, subscribeWindow } from './window-manager.js'

/**
 * `<Window>` — yokai's top-level desktop primitive. A floating
 * rectangle with a titlebar, drag-from-titlebar movement, edge/corner
 * resize handles, and focus-/hover-scoped event routing for its
 * descendants. Composes `<Surface>` for paint/layer/clip/hit-test,
 * `handleDragPress` for the titlebar drag, and `handleResizePress` for
 * each enabled handle — all driving a SINGLE rect state so the rect
 * never desyncs the way nested Draggable+Resizable does (A4 root
 * cause).
 *
 * What's baked in (intentionally — these are the desktop conventions
 * yokai consumers shouldn't have to rediscover):
 *
 * - **Single rect lifecycle**: drag mutates `{top, left}`, resize
 *   mutates `{width, height}`, both via the same setter. Yoga's
 *   absolute-rect cache stays coherent through every gesture.
 * - **Titlebar-only drag**: press on the titlebar drags the window;
 *   press inside the content area doesn't (so a `<TextInput>` inside
 *   a Window claims the press for its caret as users expect). Differs
 *   from the interim `docs/patterns/window.md` pattern where the
 *   whole Draggable was the drag affordance.
 * - **Raise-on-press**: pressing anywhere on the window promotes it
 *   to the focused window (via WindowManager) and bumps its z. Modal
 *   windows ignore press from siblings underneath (they don't get
 *   the press at all — App's hit-test honors the focus stack).
 * - **Focus-/hover-scoped routing**: every descendant's `useInput`
 *   handler auto-gates by `WindowFocusContext`; wheel events route
 *   via `CursorOverWindowContext` (hover-scoped, not focus-scoped).
 *   No `if (myWindowId === activeWindowId) return` boilerplate. See
 *   A18 / use-input.ts.
 * - **Focused/blurred chrome**: border color flips between
 *   `borderColor` and `blurredBorderColor` so a multi-window WM is
 *   legible at a glance.
 *
 * Implementation note: this branch is shipped as granular commits —
 * shell → focus → drag → resize → z math → modal → hover-routing →
 * tests → docs → demo. The current state of the file always reflects
 * everything that has landed so far on the branch; this comment block
 * documents the END SHAPE the component grows into so future readers
 * (and follow-up commits) have a clear north star.
 */
export default function Window({
  initialPos,
  initialSize,
  title,
  showCloseButton,
  onClose,
  draggable = true,
  resizable = true,
  handles = ['s', 'e', 'se'],
  bounds,
  minSize = DEFAULT_MIN_SIZE,
  maxSize,
  modal = false,
  claimsFocus = true,
  onWindowFocus,
  onWindowBlur,
  borderStyle = 'single',
  borderColor = 'cyan',
  blurredBorderColor = 'gray',
  backgroundColor,
  titlebarColor,
  backdropColor: _backdropColor = 'black',
  ref,
  tabIndex,
  autoFocus,
  claimFocusOnClick = true,
  onClick,
  onMouseDown: userOnMouseDown,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  onKeyDown,
  children,
}: WindowProps): React.ReactNode {
  // Single rect state — drag mutates {top,left} via setDragPos,
  // resize mutates {width,height} via setResizeSize; both go through
  // the SAME setRect setter. This is the A4 unification: one state,
  // one lifecycle, no rect-cache desync.
  const [rect, setRect] = useState<WindowRect>({
    top: initialPos.top,
    left: initialPos.left,
    width: initialSize.width,
    height: initialSize.height,
  })

  // Stable per-Window identity. Symbol so consumers can't fabricate one
  // and equality is always reference equality (no risk of "two windows
  // share id 'main'"). Regenerated on remount, which is the right
  // semantic — a remounted window IS a new window.
  const windowId = useMemo<WindowId>(() => Symbol('Window'), [])

  // Per-window focus state mirrored from the WindowManager. Updated via
  // a direct subscription so this Window re-renders only when its OWN
  // focus flips, not when an unrelated peer is raised.
  const [isFocused, setIsFocused] = useState<boolean>(false)

  // Callback refs — keep handler identities stable so the effects below
  // depend only on isFocused/windowId (which actually change), not on
  // the consumer's callback identity. Same pattern Draggable uses for
  // onDragStart / onDrag / onDragEnd. Refs are written every render so
  // the latest callback closure fires when a transition does happen.
  const onWindowFocusRef = useRef(onWindowFocus)
  const onWindowBlurRef = useRef(onWindowBlur)
  const userOnMouseDownRef = useRef(userOnMouseDown)
  onWindowFocusRef.current = onWindowFocus
  onWindowBlurRef.current = onWindowBlur
  userOnMouseDownRef.current = userOnMouseDown

  // Subscribe-then-register so the very first focus event (the modal /
  // claimsFocus auto-claim that fires INSIDE registerWindow) is
  // received by this Window's listener. Subscribing afterward would
  // miss that synchronous notify, forcing a manual `isWindowFocused`
  // read to recover. Order matters; don't reorder without
  // re-considering the StrictMode dev double-invoke path.
  //
  // `modal` and `claimsFocus` are intentionally NOT in the deps:
  // `modal` is captured at register-time inside the WindowManager and
  // changing it post-mount is a no-op (documented in types.ts). The
  // mount-time auto-claim driven by `claimsFocus` is also a one-shot
  // decision — adding it to deps would re-run the effect and re-
  // register the window on every toggle, swapping the windowId in a
  // way consumers definitely don't expect. Press-time `claimsFocus`
  // behavior reads through a separate ref so it tracks live changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: modal and claimsFocus are captured at mount per types.ts contract; see comment above.
  useEffect(() => {
    const unsubscribe = subscribeWindow(windowId, setIsFocused)
    const cleanup = registerWindow(windowId, modal, claimsFocus)
    return () => {
      unsubscribe()
      cleanup()
    }
  }, [windowId])

  // Track previous isFocused so the transition effect fires
  // onWindowFocus only when the value actually FLIPS — never on the
  // initial render (where wasFocused starts equal to isFocused) and
  // never on re-renders triggered by unrelated state. Initial value
  // matches the useState initial so the very first effect run is a
  // no-op for a window that mounts unfocused, and the first FLIP after
  // mount fires onWindowFocus exactly once.
  const prevFocusedRef = useRef<boolean>(false)
  useEffect(() => {
    const wasFocused = prevFocusedRef.current
    prevFocusedRef.current = isFocused
    if (wasFocused === isFocused) return
    if (isFocused) onWindowFocusRef.current?.({ windowId, isFocused: true })
    else onWindowBlurRef.current?.({ windowId, isFocused: false })
  }, [isFocused, windowId])

  // Context value provided to descendants. Memoized on its components
  // so descendant useInput hooks see a stable identity unless something
  // they care about actually changed.
  const focusContextValue = useMemo<WindowFocusValue>(
    () => ({ isFocused, windowId, modal }),
    [isFocused, windowId, modal],
  )

  // Raise-on-press: pressing anywhere on the Window promotes it to
  // focused — but only when `claimsFocus` is true. Panel windows
  // (`claimsFocus={false}`) never auto-claim, even on press, matching
  // the documented contract. Reads `claimsFocus` and the consumer
  // handler through refs so handleMouseDown's identity stays stable
  // across consumer-callback-identity churn (inline arrow handlers).
  const claimsFocusRef = useRef(claimsFocus)
  claimsFocusRef.current = claimsFocus
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      if (claimsFocusRef.current) claimWindowFocus(windowId)
      userOnMouseDownRef.current?.(e)
    },
    [windowId],
  )

  // ── titlebar drag wiring ────────────────────────────────────────
  //
  // Reuses `handleDragPress` (the pure helper Draggable exports) so the
  // drag math is byte-identical to <Draggable>. The cross-component
  // helper takes care of: tentative gesture capture (press without
  // motion remains a click), onMove → setPos, onUp → callbacks, and
  // bounds clamping when bounds are supplied. Window threads its own
  // setter (setDragPos below) that goes through setRect — so drag and
  // the upcoming resize gesture both mutate the same single rect state
  // (A4 unification).
  //
  // Refs (not values) for everything mutable so the captured gesture
  // callbacks read freshly-set values at motion time, not the values
  // captured at press time. Mirrors Draggable's pattern in
  // packages/renderer/src/components/Draggable.tsx exactly.
  const rectRef = useRef(rect)
  rectRef.current = rect
  const boundsRef = useRef<DragBounds | undefined>(bounds)
  boundsRef.current = bounds
  const widthRef = useRef<number | undefined>(rect.width)
  widthRef.current = rect.width
  const heightRef = useRef<number | undefined>(rect.height)
  heightRef.current = rect.height
  const draggableRef = useRef(draggable)
  draggableRef.current = draggable
  // latestPosRef holds the in-flight pos so onUp can read the final
  // landing spot synchronously (setRect batches; reading from React
  // state inside the gesture callback would lag by one frame).
  const latestPosRef = useRef<DragPos>({ top: rect.top, left: rect.left })

  // setDragPos: setter the gesture handler calls on every motion event.
  // Updates BOTH the rect state (drives Surface re-render) AND the
  // latestPosRef (drives onUp's final-pos read). Empty deps because
  // `setRect` from `useState` has stable identity across renders per
  // the React contract, and latestPosRef is a ref (captured by
  // reference, not by value).
  const setDragPos = useCallback((p: DragPos) => {
    latestPosRef.current = p
    setRect((r) => ({ ...r, top: p.top, left: p.left }))
  }, [])

  // Noop setters for Draggable's per-gesture state hooks that Window
  // doesn't track yet. setIsDragging / setPersistedZ are required by
  // DragPressDeps; the raise-on-press paint-z math + drag-time z boost
  // arrive in a follow-up commit on this branch, at which point these
  // become real setState calls.
  const noopBoolSetter = useCallback((_: boolean) => {}, [])
  const noopNumSetter = useCallback((_: number) => {}, [])

  // Empty-ref objects for the drag callbacks Window doesn't yet expose
  // on its prop surface (no onWindowDragStart / onDrag / onDragEnd).
  // Wrapped in useRef so identity is stable across renders.
  const noopDragCallbackRef = useRef<((info: DragInfo) => void) | undefined>(undefined)
  const noopDragDataRef = useRef<unknown>(undefined)

  // Titlebar press handler: claims gesture tentatively, drags on motion,
  // commits on release. Identity stable because every dynamic value
  // reaches the handler through refs, not closure-captured values.
  const handleTitlebarMouseDown = useCallback(
    (e: MouseDownEvent) => {
      handleDragPress(e, {
        startPos: { top: rectRef.current.top, left: rectRef.current.left },
        disabled: !draggableRef.current,
        boundsRef,
        widthRef,
        heightRef,
        latestPosRef,
        setPos: setDragPos,
        setIsDragging: noopBoolSetter,
        setPersistedZ: noopNumSetter,
        onDragStartRef: noopDragCallbackRef,
        onDragRef: noopDragCallbackRef,
        onDragEndRef: noopDragCallbackRef,
        dragDataRef: noopDragDataRef,
      })
    },
    [setDragPos, noopBoolSetter, noopNumSetter],
  )

  // ── resize handle wiring ────────────────────────────────────────
  //
  // Reuses `handleResizePress` (Resizable's pure helper) so resize math
  // is byte-identical to <Resizable>. Each handle's onMouseDown calls
  // it with the handle's direction; setResizeSize threads the new size
  // through the SAME setRect that drag uses, so {width, height} updates
  // are coherent with {top, left} — A4's single-rect lifecycle.
  //
  // Bounds: when `bounds` is set, the effective max size is reduced so
  // the window's right/bottom edge stays inside the parent's content
  // box. Combined with the consumer-supplied `maxSize`, the tighter
  // of the two wins. Recomputed every render (cheap math, reads through
  // an updated ref so live changes apply during a resize).
  const minSizeRef = useRef<ResizeSize>(minSize)
  minSizeRef.current = minSize
  const effectiveMaxSize = useMemo<ResizeSize | undefined>(() => {
    const fromBounds: ResizeSize | undefined = bounds
      ? {
          width: Math.max(1, bounds.width - rect.left),
          height: Math.max(1, bounds.height - rect.top),
        }
      : undefined
    if (!fromBounds) return maxSize
    if (!maxSize) return fromBounds
    return {
      width: Math.min(maxSize.width, fromBounds.width),
      height: Math.min(maxSize.height, fromBounds.height),
    }
  }, [bounds, maxSize, rect.left, rect.top])
  const effectiveMaxSizeRef = useRef<ResizeSize | undefined>(effectiveMaxSize)
  effectiveMaxSizeRef.current = effectiveMaxSize
  // latestSizeRef mirrors latestPosRef's role for resize — the gesture
  // handler reads it on release to get the final committed size.
  const latestSizeRef = useRef<ResizeSize>({ width: rect.width, height: rect.height })

  const setResizeSize = useCallback((s: ResizeSize) => {
    latestSizeRef.current = s
    setRect((r) => ({ ...r, width: s.width, height: s.height }))
  }, [])

  // Per-handle press dispatcher. Wrapped so each handle's onMouseDown
  // can pass its direction without re-binding identity per render.
  // stopImmediatePropagation halts bubble to the outer Surface — the
  // handle's captureGesture must win unambiguously, matching the
  // Resizable component's pattern for nested handles.
  const noopResizeCallbackRef = useRef<((info: ResizeInfo) => void) | undefined>(undefined)
  const startResize = useCallback(
    (e: MouseDownEvent, dir: ResizeHandleDirection) => {
      e.stopImmediatePropagation()
      handleResizePress(e, dir, {
        startSize: { width: rectRef.current.width, height: rectRef.current.height },
        minSizeRef,
        maxSizeRef: effectiveMaxSizeRef,
        latestSizeRef,
        setSize: setResizeSize,
        onResizeStartRef: noopResizeCallbackRef,
        onResizeRef: noopResizeCallbackRef,
        onResizeEndRef: noopResizeCallbackRef,
      })
    },
    [setResizeSize],
  )
  const onHandleS = useCallback((e: MouseDownEvent) => startResize(e, 's'), [startResize])
  const onHandleE = useCallback((e: MouseDownEvent) => startResize(e, 'e'), [startResize])
  const onHandleSe = useCallback((e: MouseDownEvent) => startResize(e, 'se'), [startResize])

  // Hover state for handle chrome. One handle hovered at a time; the
  // direction-keyed leave handler only clears if the leaving handle is
  // the currently-hovered one (handles can be swapped between without
  // a transient null-hover frame).
  const [hoveredHandle, setHoveredHandle] = useState<ResizeHandleDirection | null>(null)
  const enterHandle = useCallback((dir: ResizeHandleDirection) => () => setHoveredHandle(dir), [])
  const leaveHandle = useCallback(
    (dir: ResizeHandleDirection) => () => setHoveredHandle((cur) => (cur === dir ? null : cur)),
    [],
  )
  const handleColorFor = (dir: ResizeHandleDirection): Color =>
    hoveredHandle === dir ? HANDLE_HOVER_COLOR : HANDLE_IDLE_COLOR

  // Border inset for handle positioning. yoga places absolute children
  // relative to the parent's PADDING box (CSS §10.1) — which excludes
  // the border. With Window's default `borderStyle="single"`, that
  // shrinks the placement-coord space by 1 cell on each side. When the
  // consumer sets `borderStyle={undefined}`, no border, no shrink.
  // We don't expose per-side border control on Window, so the inset
  // is uniform on all four sides.
  const borderInset = borderStyle === undefined ? 0 : 1
  const contentWidth = Math.max(1, rect.width - 2 * borderInset)
  const contentHeight = Math.max(1, rect.height - 2 * borderInset)
  const showHandles = resizable
  const showHandleS = showHandles && handles.includes('s')
  const showHandleE = showHandles && handles.includes('e')
  const showHandleSe = showHandles && handles.includes('se')

  return (
    <WindowFocusContext.Provider value={focusContextValue}>
      <Surface
        ref={ref}
        position="absolute"
        top={rect.top}
        left={rect.left}
        width={rect.width}
        height={rect.height}
        borderStyle={borderStyle}
        borderColor={isFocused ? borderColor : blurredBorderColor}
        backgroundColor={backgroundColor}
        flexDirection="column"
        tabIndex={tabIndex}
        autoFocus={autoFocus}
        claimFocusOnClick={claimFocusOnClick}
        onClick={onClick}
        onMouseDown={handleMouseDown}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      >
        {/* Titlebar — drag affordance. Press on this row starts a
            drag via handleDragPress; the eventual onMove fires only if
            the cursor moves, so a press-and-release on the titlebar
            still reaches the outer Surface's onMouseDown as a click
            (raise-on-press, claim element focus, etc.). Pinned to
            height=1 so a long title can't wrap to a second row and eat
            the content area; the title text uses `truncate-end` for
            the visible chrome behavior consumers expect.

            The close button below uses `stopImmediatePropagation()` so
            its press never starts a titlebar drag, even if the cursor
            twitches between press and release. */}
        <Box
          flexDirection="row"
          justifyContent="space-between"
          paddingX={1}
          height={1}
          backgroundColor={titlebarColor}
          onMouseDown={handleTitlebarMouseDown}
        >
          {/* bold and dim are mutually exclusive in Text — switch via
              conditional spread so the right one applies for each focus
              state without colliding on the prop type. */}
          <Text {...(isFocused ? { bold: true } : { dim: true })} wrap="truncate-end">
            {title ?? ''}
          </Text>
          {showCloseButton && <WindowCloseButton onClose={onClose} />}
        </Box>
        {/* Content area — fills remaining vertical space. */}
        <Box flexDirection="column" flexGrow={1}>
          {children}
        </Box>
        {/* Resize handles — absolute children of the Surface, positioned
            inside the border (yoga absolute coords are relative to the
            padding box). Painted on top of content so they're grabbable
            even when content fills the area. zIndex layers SE above
            E/S so the corner cell wins paint when all three are
            enabled, matching Resizable's pattern. */}
        {showHandleE && (
          <Box
            position="absolute"
            top={0}
            left={contentWidth - 1}
            width={1}
            height={contentHeight}
            backgroundColor={handleColorFor('e')}
            onMouseDown={onHandleE}
            onMouseEnter={enterHandle('e')}
            onMouseLeave={leaveHandle('e')}
            zIndex={1}
          />
        )}
        {showHandleS && (
          <Box
            position="absolute"
            top={contentHeight - 1}
            left={0}
            width={contentWidth}
            height={1}
            backgroundColor={handleColorFor('s')}
            onMouseDown={onHandleS}
            onMouseEnter={enterHandle('s')}
            onMouseLeave={leaveHandle('s')}
            zIndex={1}
          />
        )}
        {showHandleSe && (
          <Box
            position="absolute"
            top={contentHeight - 1}
            left={contentWidth - 1}
            width={1}
            height={1}
            backgroundColor={handleColorFor('se')}
            onMouseDown={onHandleSe}
            onMouseEnter={enterHandle('se')}
            onMouseLeave={leaveHandle('se')}
            zIndex={2}
          >
            <Text>◢</Text>
          </Box>
        )}
      </Surface>
    </WindowFocusContext.Provider>
  )
}

// ── module-scope constants ───────────────────────────────────────────

/**
 * Default minimum resize size. Wide enough for a 4-char title +
 * close button (≈ 8 cells), tall enough for the titlebar row + a
 * single content row + two border rows (≈ 4 cells, with 1 to spare).
 * Smaller and the window is visually broken; this floor prevents
 * accidental resize-into-invisibility.
 */
const DEFAULT_MIN_SIZE: ResizeSize = { width: 8, height: 4 }

/**
 * Handle background color when idle. Gray reads as "interactive but
 * not active" against most terminal themes. Mirrors Resizable's
 * default to keep the visual vocabulary consistent across primitives.
 */
const HANDLE_IDLE_COLOR: Color = 'gray'

/**
 * Handle background color when the cursor is over the handle. Bright
 * enough to read as "grab me" against the idle gray.
 */
const HANDLE_HOVER_COLOR: Color = 'white'

/**
 * Internal close button. Same pattern as the interim
 * `docs/patterns/window.md` CloseButton — `captureGesture({ onUp })`
 * so a press-and-release without motion fires `onClose` even though
 * the surrounding titlebar owns drag press handling. captureGesture
 * is first-call-wins; the leaf wins. `stopImmediatePropagation` then
 * halts the bubble before it reaches the titlebar's drag handler OR
 * the outer Surface's raise-on-press handler (closing a window
 * doesn't need to focus it first).
 *
 * Kept private to this file because Window owns the chrome; consumers
 * who want custom close styling should leave `showCloseButton` off and
 * render their own clickable in `children` (or in the titlebar via the
 * planned `titlebarRight` slot prop).
 */
function WindowCloseButton({ onClose }: { onClose?: () => void }): React.ReactNode {
  const [hover, setHover] = useState(false)
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      e.stopImmediatePropagation()
      e.captureGesture({ onUp: () => onClose?.() })
    },
    [onClose],
  )
  return (
    <Box
      paddingX={1}
      backgroundColor={hover ? 'red' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={handleMouseDown}
    >
      <Text bold={hover} color={hover ? 'white' : 'gray'}>
        ×
      </Text>
    </Box>
  )
}
