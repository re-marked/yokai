/**
 * Shared types for the `<Surface>` primitive — the foundational
 * rectangle that every desktop UI element in yokai is built from.
 * Kept in their own file so the React shell, the pure helpers (layer /
 * shadow), and consumers can import names without dragging the whole
 * component module along.
 */

import type { Ref } from 'react'
import type { DOMElement } from '../../dom.js'
import type { ClickEvent } from '../../events/click-event.js'
import type { FocusEvent } from '../../events/focus-event.js'
import type { KeyboardEvent } from '../../events/keyboard-event.js'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import type { PasteEvent } from '../../events/paste-event.js'
import type { Color, Styles } from '../../styles.js'

/**
 * Named z-index bands for desktop UI primitives. Surface resolves
 * `layer` to a numeric `zIndex` (see `resolveZIndex` in `layer.ts`) so
 * higher-level components don't rediscover "what z is a modal" — the
 * vocabulary is fixed once here.
 *
 * Bands are 100/1000 apart so consumers can nudge within a band via the
 * numeric `zIndex` escape hatch (e.g. `<Surface layer="modal" zIndex={3001}>`
 * is a modal painting just above a peer modal).
 *
 *   base       0     default — no layer
 *   docked     100   sidebars, status bars, taskbars
 *   overlay    1000  floating panels (Window body)
 *   dropdown   2000  select / menu dropdowns above panels
 *   modal      3000  modal dialogs + their backdrops
 *   popover    4000  popovers anchored to elements
 *   tooltip    5000  tooltips above popovers
 *   drag-ghost 6000  drag previews above everything
 */
export type SurfaceLayer =
  | 'base'
  | 'docked'
  | 'overlay'
  | 'dropdown'
  | 'modal'
  | 'popover'
  | 'tooltip'
  | 'drag-ghost'

/**
 * Elevation level for `<Surface>` shadow rendering. `0` (default) paints
 * no shadow; `1`-`5` paint a progressively wider / dimmer terminal-cell
 * shadow band offset one cell down-right of the Surface's rect. Only
 * meaningful on `position: 'absolute'` Surfaces — an in-flow shadow
 * would shift sibling layout (see dev warning in `Surface.tsx`).
 */
export type SurfaceElevation = 0 | 1 | 2 | 3 | 4 | 5

/**
 * `<Surface>` is yokai's foundational rectangle primitive — a paintable,
 * layered, optionally hit-test-bounded region. Every higher-level
 * desktop primitive (`<Window>`, modal panels, popovers, tooltips,
 * dropdowns, drag ghosts, backdrops) paints through Surface so they
 * share a single vocabulary for paint / layout / layer / clip / hit-test
 * / elevation. Without it, every primitive would rediscover Box's
 * low-level semantics ad hoc and drift.
 *
 * Surface is intentionally NOT a window — no titlebar, no drag state,
 * no resize handles, no focus ownership, no window-manager policy. All
 * of those live in higher-level components that compose Surface as
 * their paint substrate.
 */
export type SurfaceProps = {
  // ── layout / box-model passthrough ───────────────────────────────
  /**
   * CSS-flex position. `'relative'` participates in the flex flow;
   * `'absolute'` removes the Surface from flow and lets `top`/`left`/
   * `right`/`bottom` place it freely. `hitTestBoundary`, `elevation`,
   * and `backdrop` are only meaningful when `position='absolute'` —
   * a dev warning fires for each if set with `position='relative'`.
   */
  position?: 'relative' | 'absolute'
  top?: Styles['top']
  left?: Styles['left']
  right?: Styles['right']
  bottom?: Styles['bottom']
  width?: Styles['width']
  height?: Styles['height']
  minWidth?: Styles['minWidth']
  minHeight?: Styles['minHeight']
  maxWidth?: Styles['maxWidth']
  maxHeight?: Styles['maxHeight']
  flexDirection?: Styles['flexDirection']
  flexGrow?: Styles['flexGrow']
  flexShrink?: Styles['flexShrink']
  flexBasis?: Styles['flexBasis']
  flexWrap?: Styles['flexWrap']
  alignItems?: Styles['alignItems']
  alignSelf?: Styles['alignSelf']
  justifyContent?: Styles['justifyContent']
  gap?: Styles['gap']
  columnGap?: Styles['columnGap']
  rowGap?: Styles['rowGap']
  // ── borders / background ─────────────────────────────────────────
  borderStyle?: Styles['borderStyle']
  borderColor?: Styles['borderColor']
  borderTop?: Styles['borderTop']
  borderRight?: Styles['borderRight']
  borderBottom?: Styles['borderBottom']
  borderLeft?: Styles['borderLeft']
  borderTopColor?: Styles['borderTopColor']
  borderRightColor?: Styles['borderRightColor']
  borderBottomColor?: Styles['borderBottomColor']
  borderLeftColor?: Styles['borderLeftColor']
  borderDimColor?: Styles['borderDimColor']
  backgroundColor?: Color
  // ── padding / margin ─────────────────────────────────────────────
  padding?: Styles['padding']
  paddingX?: Styles['paddingX']
  paddingY?: Styles['paddingY']
  paddingTop?: Styles['paddingTop']
  paddingRight?: Styles['paddingRight']
  paddingBottom?: Styles['paddingBottom']
  paddingLeft?: Styles['paddingLeft']
  margin?: Styles['margin']
  marginX?: Styles['marginX']
  marginY?: Styles['marginY']
  marginTop?: Styles['marginTop']
  marginRight?: Styles['marginRight']
  marginBottom?: Styles['marginBottom']
  marginLeft?: Styles['marginLeft']
  // ── overflow (manual escape from clip prop) ──────────────────────
  /**
   * Direct overflow override. Use `clip` for the Surface-friendly
   * vocabulary; this is the escape hatch when you need different
   * X/Y values or `'scroll'`. When set, takes precedence over `clip`.
   */
  overflow?: Styles['overflow']
  overflowX?: Styles['overflowX']
  overflowY?: Styles['overflowY']
  // ── Surface-specific ─────────────────────────────────────────────
  /**
   * Named z-index band — see `SurfaceLayer`. Default `'base'` resolves
   * to no zIndex on the underlying ink-box, so a `<Surface>` with no
   * layer + no explicit `zIndex` is byte-identical to a `<Box>` with
   * the same props. When both `layer` and `zIndex` are supplied,
   * `zIndex` wins (numeric escape hatch lets consumers nudge within
   * a band).
   *
   * Only applied when `position='absolute'` — matches the renderer's
   * existing rule that zIndex is meaningless on in-flow nodes. No
   * warning is emitted for `layer` on a relative Surface because the
   * default `'base'` is harmless; warnings fire instead on the more
   * obvious mistakes (`hitTestBoundary`, `elevation`, `backdrop` on
   * non-absolute).
   */
  layer?: SurfaceLayer
  /**
   * Numeric z-index escape hatch. Wins over `layer` when both are
   * supplied. Same renderer rule: only applies when
   * `position='absolute'`; the existing `ifZIndexWithoutAbsolute`
   * dev warning fires for non-absolute use.
   */
  zIndex?: number
  /**
   * Convenience for `overflow: 'hidden'`. `'visible'` (default) lets
   * children paint outside the Surface's rect — matches Box's default
   * so swapping `<Box>` → `<Surface>` doesn't surprise. `'hidden'`
   * clips children to the Surface's content area (used by Resizable
   * to prevent transient overflow during resize). `overflow` /
   * `overflowX` / `overflowY` props override `clip` when set.
   */
  clip?: 'hidden' | 'visible'
  /**
   * Marks this Surface as a hit-test boundary — at any cell it
   * covers, mouse events go to this Surface (or its children), not
   * to lower-z absolute siblings beneath. Used by modals / popovers
   * / menus that need to absorb clicks even on transparent regions.
   * Default `false`: Surface behaves like a normal `<Box>` (current
   * reverse-z iteration already gives top-most-wins semantics for
   * any cell it covers, so the flag is forward-looking — codifies
   * intent and protects against future hit-test refactors).
   *
   * Must be combined with `position='absolute'`; dev-warn + silently
   * ignored otherwise.
   */
  hitTestBoundary?: boolean
  /**
   * Drop-shadow elevation level. `0` (default) paints no shadow.
   * `1`-`5` paint a progressively wider terminal-cell shadow band
   * offset 1 cell down-right of the Surface's rect, using a single
   * reserved dim color (terminals don't do alpha, so we ship a
   * documented dim band). Only meaningful with `position='absolute'`
   * — an in-flow shadow would shift sibling layout. See `shadow.ts`
   * for the exact cell math.
   */
  elevation?: SurfaceElevation
  /**
   * When `true`, auto-renders a sibling scrim Box behind this
   * Surface, filling the parent container with `backdropColor`,
   * layered exactly one z step below this Surface. Used by modal
   * dialogs to dim the underlying content. Only meaningful with
   * `position='absolute'`; dev-warn + silently ignored otherwise.
   */
  backdrop?: boolean
  /**
   * Solid backdrop color when `backdrop=true`. Terminals don't support
   * alpha; this is a solid fill. Default `'black'`. Use any value the
   * styles system accepts (named ANSI color, hex `#101820`, etc.).
   */
  backdropColor?: Color
  // ── focus / event handlers (pass through to ink-box) ─────────────
  ref?: Ref<DOMElement>
  tabIndex?: number
  autoFocus?: boolean
  claimFocusOnClick?: boolean
  onClick?: (event: ClickEvent) => void
  onMouseDown?: (event: MouseDownEvent) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onFocus?: (event: FocusEvent) => void
  onFocusCapture?: (event: FocusEvent) => void
  onBlur?: (event: FocusEvent) => void
  onBlurCapture?: (event: FocusEvent) => void
  onKeyDown?: (event: KeyboardEvent) => void
  onKeyDownCapture?: (event: KeyboardEvent) => void
  onPaste?: (event: PasteEvent) => void
  onPasteCapture?: (event: PasteEvent) => void
  children?: React.ReactNode
}
