import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type React from 'react'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import Box from '../Box.js'
import { type DragBounds, type DragInfo, type DragPos, handleDragPress } from '../Draggable.js'
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
  // resizable, handles, minSize, maxSize — wired in follow-up commits.
  // Destructured here so the shell accepts the full prop surface from
  // day one (no public API churn between intermediate commits).
  resizable: _resizable = true,
  handles: _handles = ['s', 'e', 'se'],
  bounds,
  minSize: _minSize,
  maxSize: _maxSize,
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
  // Single rect state — drag mutates {top,left} via setDragPos below,
  // resize will mutate {width,height} via the same setRect setter
  // in a follow-up commit. This is the A4 unification: one state, one
  // lifecycle, no rect-cache desync.
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
      </Surface>
    </WindowFocusContext.Provider>
  )
}

/**
 * Internal close button. Same pattern as the interim
 * `docs/patterns/window.md` CloseButton — `captureGesture({ onUp })` so
 * a press-and-release without motion fires `onClose` even though the
 * surrounding titlebar will (in a follow-up commit) own drag press
 * handling. captureGesture is first-call-wins; the leaf wins.
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
