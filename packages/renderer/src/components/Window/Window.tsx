import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import type React from 'react'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import Box from '../Box.js'
import Surface from '../Surface/Surface.js'
import Text from '../Text.js'
import { WindowFocusContext } from './context.js'
import type { WindowFocusValue, WindowId, WindowProps, WindowRect } from './types.js'
import {
  claimWindowFocus,
  isWindowFocused,
  registerWindow,
  subscribeWindow,
} from './window-manager.js'

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
 * Implementation note: this commit lands the React shell + WindowManager
 * integration + focus chrome. Drag, resize, modal backdrop, and
 * hover-scoped wheel arrive in follow-up commits on the same branch —
 * each one a clean step the user can review independently.
 */
export default function Window({
  initialPos,
  initialSize,
  title,
  showCloseButton,
  onClose,
  // draggable, resizable, handles, bounds, minSize, maxSize — wired in
  // follow-up commits. Destructured here so the shell already accepts
  // the full prop surface from day one (no public API churn between
  // intermediate commits).
  draggable: _draggable = true,
  resizable: _resizable = true,
  handles: _handles = ['s', 'e', 'se'],
  bounds: _bounds,
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
  // Single rect state — drag mutates {top,left}, resize mutates
  // {width,height}, both via the same setRect setter. This is the A4
  // unification: one state, one lifecycle, no desync.
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

  // Per-window focus state mirrored from the WindowManager. We subscribe
  // to "did my focus state change?" so this Window re-renders only when
  // its OWN focus flips, not when an unrelated sibling is raised.
  const [isFocused, setIsFocused] = useState<boolean>(false)

  // Register with the WindowManager on mount; unregister on unmount.
  // The manager claims focus for this window during register (when
  // claimsFocus is true OR when modal). Subscribe to focus flips so
  // the local isFocused mirror stays in sync with the manager's truth.
  useEffect(() => {
    const cleanup = registerWindow(windowId, modal, claimsFocus)
    setIsFocused(isWindowFocused(windowId))
    const unsubscribe = subscribeWindow(windowId, (focused) => {
      setIsFocused(focused)
    })
    return () => {
      unsubscribe()
      cleanup()
    }
    // windowId is stable for the mount's lifetime; modal/claimsFocus
    // changes after mount are ignored intentionally (matches the
    // defaultValue semantics applied to initialPos/initialSize — a
    // window's "is it modal" is a mount-time decision).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [windowId])

  // Fire onWindowFocus / onWindowBlur on isFocused transitions. Skipping
  // the initial render: the registerWindow effect above sets isFocused
  // to its mounted value synchronously, and consumers expect onWindowFocus
  // to fire as part of the mount lifecycle if the window mounts focused.
  // Using a separate effect keyed on isFocused gives that for free.
  useEffect(() => {
    if (isFocused) onWindowFocus?.({ windowId, isFocused: true })
    else onWindowBlur?.({ windowId, isFocused: false })
    // onWindowFocus / onWindowBlur aren't deps — consumers don't expect
    // them to re-fire just because their identity changed. They're
    // read at transition time, which matches what they're documenting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused, windowId])

  // Context value provided to descendants. Memoized on its components
  // so descendant useInput hooks see a stable identity unless something
  // they care about actually changed.
  const focusContextValue = useMemo<WindowFocusValue>(
    () => ({ isFocused, windowId, modal }),
    [isFocused, windowId, modal],
  )

  // Raise-on-press: pressing anywhere on the Window promotes it to
  // focused. Runs BEFORE the consumer's onMouseDown so the consumer
  // already sees this window as focused if it inspects WindowFocusContext.
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      claimWindowFocus(windowId)
      userOnMouseDown?.(e)
    },
    [windowId, userOnMouseDown],
  )

  // _rect is consumed by Surface as top/left/width/height below.
  // setRect is plumbed into the drag/resize handlers in follow-up
  // commits — exposed via closures from this scope, no prop drilling.
  void setRect

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
        {/* Titlebar — drag affordance in the next commit. For now a
            static row with the title text + optional close button. */}
        <Box
          flexDirection="row"
          justifyContent="space-between"
          paddingX={1}
          backgroundColor={titlebarColor}
        >
          {/* bold and dim are mutually exclusive in Text — switch via
              conditional spread so the right one applies for each focus
              state without colliding on the prop type. */}
          <Text {...(isFocused ? { bold: true } : { dim: true })}>{title ?? ''}</Text>
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
