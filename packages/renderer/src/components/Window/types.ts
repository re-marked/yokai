/**
 * Shared types for the `<Window>` primitive — yokai's top-level desktop
 * window. A Window is the composition surface that fuses Surface (paint /
 * layer / clip / hit-test / elevation), titlebar drag (via the same
 * `handleDragPress` Draggable uses), edge/corner resize (via the same
 * `handleResizePress` Resizable uses), bordered chrome, raise-on-press z
 * math, and focus-/hover-scoped event routing into ONE primitive with
 * ONE state machine and ONE rect lifecycle.
 *
 * Kept in their own file so the React shell, the focus-context layer,
 * and consumers can import names without dragging the whole component
 * module along — same pattern as Surface/types.ts.
 *
 * See `docs/components/window.md` for the prop reference and examples;
 * `docs/internals/window.md` for the single-rect state machine, focus
 * stack, and routing rules; CLAUDE.md "Window primitive" gotcha for the
 * load-bearing invariants.
 */

import type { Ref } from 'react'
import type { DOMElement } from '../../dom.js'
import type { ClickEvent } from '../../events/click-event.js'
import type { FocusEvent } from '../../events/focus-event.js'
import type { KeyboardEvent } from '../../events/keyboard-event.js'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import type { Color, Styles } from '../../styles.js'
import type { DragBounds, DragPos } from '../Draggable.js'
import type { ResizeHandleDirection, ResizeSize } from '../Resizable.js'

/**
 * The window's rectangle in cell coordinates. Drag mutates `{top, left}`;
 * resize mutates `{width, height}`. Both go through the SAME setter so
 * the rect always reflects a single source of truth — fixing the A4 root
 * cause where Draggable + Resizable each owned half of the rect and the
 * absolute-rect cache went out of sync.
 */
export type WindowRect = {
  top: number
  left: number
  width: number
  height: number
}

/** Re-exported convenience aliases so consumers can import everything
 *  from Window without remembering which sibling primitive owns the
 *  vocabulary. */
export type {
  DragBounds,
  DragPos,
  ResizeHandleDirection,
  ResizeSize,
}

/**
 * Information passed to window-level focus callbacks. `windowId` is the
 * stable identity assigned at mount — opaque to consumers but useful as
 * a discriminator when one handler manages many windows.
 */
export type WindowFocusInfo = {
  windowId: WindowId
  isFocused: boolean
}

/**
 * Opaque per-window identifier. A `symbol` so consumers can't fabricate
 * one (only Window's lifecycle can mint it) and so window equality is
 * always reference equality — no risk of "two windows have id 'main'."
 */
export type WindowId = symbol

/**
 * The value shape carried by `WindowFocusContext`. Read by `useInput` to
 * auto-gate keyboard handlers, by descendants that want to render
 * focus-aware chrome, and by `useWindow()` consumers that need to
 * introspect.
 *
 * `null` outside any Window — `useInput` treats that as "global mode,
 * always active" for back-compat with consumers that never opt into
 * the Window primitive.
 */
export type WindowFocusValue = {
  /**
   * True when this Window currently owns window-level focus. Mutates as
   * focus moves between windows (raise-on-press promotes the pressed
   * window to focused). When `modal` is set on ANY window in the focus
   * stack, only the topmost modal is focused; all others read `false`.
   */
  isFocused: boolean
  /**
   * Stable identity for the enclosing Window. Same symbol for the whole
   * Window subtree's lifetime, regenerated on remount.
   */
  windowId: WindowId
  /**
   * True when the Window declared `modal`. Descendants almost never
   * need this — it's exposed so `useInput`'s gating can match the
   * "modal blocks siblings" rule without re-reading the focus stack.
   */
  modal: boolean
}

/**
 * Where the cursor currently is, in terms of which Window (if any) it's
 * hovering over. Populated by App per-frame from the existing hit-test
 * layer; consumed by `useInput` for the WHEEL routing rule (hover-scoped,
 * not focus-scoped — wheel scrolls whatever the cursor is over, matching
 * real OSes).
 *
 * `null` when the cursor is over no Window (e.g. over a sidebar that's
 * not wrapped in a Window, or off the terminal). Wheel handlers in that
 * case fall through to global handlers, same back-compat shape as the
 * focus context.
 */
export type CursorOverWindowValue = {
  windowId: WindowId
} | null

/**
 * `<Window>` is yokai's top-level desktop primitive — a floating
 * rectangle with a titlebar, drag-from-titlebar movement, edge/corner
 * resize, and focus-/hover-scoped event routing for everything inside.
 *
 * Composed of:
 *   - `<Surface>` as the paint substrate (so all desktop-primitive
 *     layering, clipping, hit-test, and elevation behavior is uniform)
 *   - `handleDragPress` for titlebar drag (the same extracted helper
 *     Draggable uses, so drag math is identical)
 *   - `handleResizePress` for each enabled resize handle (the same
 *     extracted helper Resizable uses)
 *   - `WindowFocusContext` + `CursorOverWindowContext` providers so
 *     descendants' keyboard/wheel handlers auto-gate by focus/hover
 *
 * Critical invariant: the Window owns a SINGLE rect state. Drag and
 * resize handlers mutate it through the same setter, so the rect is
 * always coherent — no rect-cache desync the way nesting Draggable
 * inside Resizable produces (A4 root cause).
 *
 * Window is NOT just `Draggable + Resizable + chrome`. The state-machine
 * unification + focus-scope context layer is the real product; the
 * chrome is the visible affordance.
 */
export type WindowProps = {
  // ── initial geometry ─────────────────────────────────────────────
  /**
   * Initial top-left in cell coordinates relative to the parent's
   * content edge. Like `Draggable.initialPos`: seeded at mount, ignored
   * on subsequent renders (defaultValue semantics). After mount, the
   * Window owns its position.
   */
  initialPos: DragPos
  /**
   * Initial size in cells. Same defaultValue semantics — after mount,
   * the Window owns its size. Width AND height are required; auto-
   * sizing windows isn't supported (the auto-size + drag + resize
   * combination is exactly what makes the current Draggable/Resizable
   * composition fail).
   */
  initialSize: ResizeSize
  // ── chrome ────────────────────────────────────────────────────────
  /**
   * Title rendered in the titlebar. May be empty — the titlebar still
   * renders (it's the drag affordance), just without a label. Consumers
   * who want a custom titlebar should leave `title` blank and put their
   * own content inside `<Window>` (the convention is "first child is the
   * titlebar's right slot, after the title").
   */
  title?: string
  /**
   * Renders a × close button at the titlebar's right edge. The button
   * uses `captureGesture({ onUp })` so it doesn't race the titlebar
   * drag — pressing the close button never starts a drag, even if the
   * cursor twitches between press and release.
   */
  showCloseButton?: boolean
  /**
   * Fires when the close button is released over itself. Consumers
   * typically unmount the Window in response. Not fired by Esc, by
   * focus loss, or by anything else — close is an explicit action.
   */
  onClose?: () => void
  // ── drag / resize behavior ────────────────────────────────────────
  /**
   * When `false`, the titlebar is NOT a drag affordance — the window
   * stays fixed at `initialPos`. Useful for pinned panels (sidebars
   * styled as windows, fixed status overlays). Default `true`.
   */
  draggable?: boolean
  /**
   * When `false`, no resize handles render and the window stays at
   * `initialSize` forever. Useful for fixed-size dialogs / about boxes
   * where resize would just add clutter. Default `true`.
   */
  resizable?: boolean
  /**
   * Which resize handles to render. Default `['s', 'e', 'se']` — the
   * three bottom-right family handles that Resizable supports. Same
   * v1 constraint applies: north/west/NW/SW/NE aren't supported (they
   * shift the layout origin in ways that fight flexbox).
   */
  handles?: ResizeHandleDirection[]
  /**
   * Drag clamp in parent content space. When set, the window's full
   * rect stays inside `[0,0]` to `[bounds.width, bounds.height]`. Drag
   * AND resize both respect this — a resize that would push the right
   * edge past `bounds.width` clamps at the boundary. Without bounds,
   * the window can be dragged and grown freely (until it overflows the
   * terminal viewport, which the renderer handles by clipping paint
   * to the visible cell grid).
   */
  bounds?: DragBounds
  /**
   * Minimum size during resize. Defaults to `{ width: 8, height: 3 }`
   * — wide enough for a 4-char title + close button, tall enough for
   * the titlebar + a single content row. Smaller and the window is
   * visually broken; the floor stops the user from accidentally
   * resizing into invisibility.
   */
  minSize?: ResizeSize
  /**
   * Maximum size during resize. Optional — when omitted, the only
   * upper bound is `bounds` (if set) or the terminal viewport.
   */
  maxSize?: ResizeSize
  // ── focus / routing ───────────────────────────────────────────────
  /**
   * When `true`, this is a modal window — claims window-level focus on
   * mount, renders a backdrop scrim, and blocks event delivery to any
   * sibling windows underneath (only the modal and its descendants
   * receive events). Nested modals stack — innermost wins.
   *
   * Implementation: same backdrop machinery as `<Surface backdrop>`,
   * plus the WindowManager treats modals as a hard barrier in the focus
   * stack. Esc does NOT close modals automatically — consumers wire
   * that via `onClose` if they want it.
   */
  modal?: boolean
  /**
   * When `true` (default), pressing anywhere on this window promotes it
   * to focused. When `false`, the window never claims focus on press —
   * useful for "panel" windows (tool palettes, mini-maps) that should
   * stay above content but never steal focus from the user's text-
   * editing window.
   *
   * Has no effect on `modal` windows; modals always claim focus on
   * mount regardless of `claimsFocus`.
   */
  claimsFocus?: boolean
  /**
   * Fires when this window becomes the focused window. `info.windowId`
   * is the stable identity. Useful for "remember which window the user
   * was last in" persistence, or for ARIA-style live-region updates.
   */
  onWindowFocus?: (info: WindowFocusInfo) => void
  /**
   * Fires when this window loses window-level focus (another window
   * was raised, or this window unmounted before another was raised).
   */
  onWindowBlur?: (info: WindowFocusInfo) => void
  // ── visual ────────────────────────────────────────────────────────
  /**
   * Border style when focused. Default `'single'`. Same vocabulary as
   * Surface/Box `borderStyle`.
   */
  borderStyle?: Styles['borderStyle']
  /**
   * Border color when focused. Default `'cyan'` — a deliberate
   * "this is the active window" visual hint. Override per-app theme.
   */
  borderColor?: Color
  /**
   * Border color when blurred (window not focused). Default `'gray'`.
   * The focused/blurred distinction is what makes a multi-window WM
   * legible — at a glance the user knows which keyboard input belongs
   * to which window.
   */
  blurredBorderColor?: Color
  /**
   * Background fill color for the window body. Default `undefined`
   * (transparent — terminal background shows through). Set to `'black'`
   * or your theme bg for opaque windows that don't leak content from
   * windows behind them.
   */
  backgroundColor?: Color
  /**
   * Background color of the titlebar row when focused. Default
   * `undefined` (matches `backgroundColor`). Set to a tint to make the
   * titlebar visually distinct (e.g. macOS-style "title strip").
   */
  titlebarColor?: Color
  /**
   * Backdrop scrim color when `modal=true`. Default `'black'`. Solid
   * fill (terminals don't do alpha). Use a low-contrast value like
   * `'#101820'` if a hard black is too jarring.
   */
  backdropColor?: Color
  // ── focus / event handlers (pass through to underlying Surface) ──
  ref?: Ref<DOMElement>
  tabIndex?: number
  autoFocus?: boolean
  /**
   * Per-window override of the global Window focus behavior. When
   * `false`, pressing the window does NOT call `claimWindowFocus()`.
   * Distinct from `claimsFocus` (which controls window-LEVEL focus) —
   * this controls ELEMENT-level focus via the existing FocusManager.
   * Default `true` so consumers get the obvious behavior without
   * threading the prop.
   */
  claimFocusOnClick?: boolean
  onClick?: (event: ClickEvent) => void
  onMouseDown?: (event: MouseDownEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  children?: React.ReactNode
}
