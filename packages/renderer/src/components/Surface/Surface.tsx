import { Fragment, type ReactNode } from 'react'
import type React from 'react'
import * as warn from '../../warn.js'
import { resolveZIndex } from './layer.js'
import type { SurfaceProps } from './types.js'

/**
 * `<Surface>` — the foundational rectangle primitive that every desktop
 * UI element in yokai is built from. A Surface is a paintable, layered,
 * optionally hit-test-bounded region that higher-level primitives
 * (`<Window>`, modal panels, popovers, tooltips, dropdowns, drag
 * ghosts, backdrops) compose to share a single vocabulary for paint /
 * layout / layer / clip / hit-test / elevation.
 *
 * Surface is intentionally NOT a window — no titlebar, no drag state,
 * no resize handles, no focus ownership, no window-manager policy. Those
 * live in higher-level components that use Surface as their paint
 * substrate. `<Draggable>` and `<Resizable>` paint through Surface so
 * their layering, clipping, and hit-test behavior matches anything
 * else built on the primitive.
 *
 * Implementation: thin React shell over `<ink-box>`. The only renderer
 * additions are two host attributes — `surfaceHitTestBoundary` and
 * `surfaceElevation` — both gated on `position: 'absolute'` and
 * silently no-op'd elsewhere (with a dev warning from `warn.ts`). The
 * shadow paint (when `elevation > 0`) and the auto-rendered backdrop
 * sibling are both bounded to absolute Surfaces too, so the
 * "Surface is a Box with a few escape hatches" mental model holds: a
 * default `<Surface>` (no extras) is byte-identical to a default
 * `<Box>` with the same props.
 *
 * See `docs/components/surface.md` for the layer table, examples, and
 * design rationale; `docs/internals/surface.md` for renderer details.
 */
export default function Surface({
  position = 'relative',
  layer,
  zIndex,
  clip,
  hitTestBoundary,
  elevation,
  shadowColor,
  backdrop,
  backdropColor = 'black',
  ref,
  tabIndex,
  autoFocus,
  claimFocusOnClick,
  onClick,
  onMouseDown,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onFocusCapture,
  onBlur,
  onBlurCapture,
  onKeyDown,
  onKeyDownCapture,
  onPaste,
  onPasteCapture,
  children,
  ...rest
}: SurfaceProps & { children?: ReactNode }): React.ReactNode {
  // Dev warnings for misuse on non-absolute Surfaces. Each warning is
  // gated on (a) the prop being actively set (non-default), and (b) the
  // Surface NOT being absolute. logForDebugging is a no-op in prod —
  // see warn.ts for the gating contract.
  warn.ifHitTestBoundaryWithoutAbsolute(hitTestBoundary, position)
  warn.ifElevationWithoutAbsolute(elevation, position)
  warn.ifBackdropWithoutAbsolute(backdrop, position)

  const resolvedZ = resolveZIndex(layer, zIndex)
  // `clip` is the Surface vocabulary; explicit `overflow` / `overflowX`
  // / `overflowY` win when set so consumers can mix-and-match. The
  // mapping is symmetric — `clip='hidden'` sets both axes. `clip` left
  // undefined defers to the underlying Box default (`'visible'`).
  const clippedX = clip === 'hidden' ? 'hidden' : undefined
  const clippedY = clip === 'hidden' ? 'hidden' : undefined

  // Surface-specific host attributes — set only when active so the
  // emitted DOM stays minimal for the default case. The renderer's
  // existing absolute-only gates on these attributes mean they're
  // silently ignored when `position` is relative, but we still emit
  // them per the consumer's intent (the dev warning above is the
  // signal that something will be ignored).
  const surfaceHitTestBoundary = hitTestBoundary === true ? true : undefined
  const surfaceElevation = typeof elevation === 'number' && elevation > 0 ? elevation : undefined
  // Pass through only when the consumer actively set a color AND the
  // surface is actually elevated. Avoids polluting the rendered DOM
  // attrs for the common case where the default `#1a1a1a` is fine.
  const surfaceShadowColor =
    surfaceElevation !== undefined && typeof shadowColor === 'string' ? shadowColor : undefined

  const surface = (
    <ink-box
      ref={ref}
      tabIndex={tabIndex}
      autoFocus={autoFocus}
      claimFocusOnClick={claimFocusOnClick}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onFocusCapture={onFocusCapture}
      onBlur={onBlur}
      onBlurCapture={onBlurCapture}
      onKeyDown={onKeyDown}
      onKeyDownCapture={onKeyDownCapture}
      onPaste={onPaste}
      onPasteCapture={onPasteCapture}
      surfaceHitTestBoundary={surfaceHitTestBoundary}
      surfaceElevation={surfaceElevation}
      surfaceShadowColor={surfaceShadowColor}
      style={{
        // Match Box's defaults so swapping `<Box>` → `<Surface>` doesn't
        // silently regress layouts. Yoga's own defaults (column, no flex,
        // flexShrink=0, nowrap) differ from Box's React-side defaults
        // (row, flexShrink=1) — Surface defers to Box's flavor, not
        // Yoga's. Caller's `rest` spreads AFTER so explicit values win.
        // Codex P1 review on PR #90.
        flexDirection: 'row',
        flexWrap: 'nowrap',
        flexGrow: 0,
        flexShrink: 1,
        ...rest,
        position,
        zIndex: resolvedZ,
        // overflowX / overflowY: caller's explicit value wins, else
        // the `overflow` shorthand they passed, else the `clip` prop's
        // mapping, else undefined (defers to Box default).
        overflowX: rest.overflowX ?? rest.overflow ?? clippedX,
        overflowY: rest.overflowY ?? rest.overflow ?? clippedY,
      }}
    >
      {children}
    </ink-box>
  )

  // Backdrop auto-sibling. When `backdrop=true` AND the Surface is
  // absolute, render a scrim Box that fills the parent and sits at
  // exactly one z step below this Surface. The scrim is intentionally
  // a sibling (not a child) — it lives in the parent's coordinate
  // space and must NOT be clipped by this Surface's overflow.
  //
  // Layered at (resolvedZ - 1) so it always paints directly beneath
  // this Surface but above any peer Surfaces at lower bands. If a
  // consumer raises a second modal on top (e.g. nested confirm dialog),
  // its own backdrop will pair with it correctly because each
  // backdrop's z derives from its OWN Surface's resolved z.
  //
  // Backdrop on a non-absolute Surface is silently skipped (dev-warn
  // already fired above) because rendering an absolute backdrop inside
  // an in-flow Surface would still affect the in-flow parent's
  // layout in subtle ways (yoga sees one fewer in-flow child).
  if (backdrop !== true || position !== 'absolute') return surface
  const backdropZ = resolvedZ !== undefined ? resolvedZ - 1 : -1
  return (
    <Fragment>
      <ink-box
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundColor: backdropColor,
          zIndex: backdropZ,
        }}
      />
      {surface}
    </Fragment>
  )
}
