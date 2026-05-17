/**
 * Layer-to-zIndex resolver for `<Surface>`. Pure — no React, no DOM.
 *
 * Centralized so every desktop primitive that paints through Surface
 * (Window, Modal, Tooltip, Popover, DragGhost, …) speaks the same
 * z-band vocabulary instead of each one rediscovering "what z is a
 * modal" with subtly incompatible numbers.
 */

import type { SurfaceLayer } from './types.js'

/**
 * Numeric z-index band for each named layer. Gaps of 100 / 1000
 * leave room for consumers to nudge within a band via the explicit
 * `zIndex` prop (`<Surface layer="modal" zIndex={3001}>` paints a
 * modal one step above a peer modal). The values are deliberately
 * round so call-site debugging ("what z is the offender at?") maps
 * back to a layer at a glance.
 *
 * `base` is `0` so that a default `<Surface>` (no layer prop, no
 * `zIndex` prop) produces no `zIndex` style at all (see
 * `resolveZIndex`), keeping the rendered DOM byte-identical to a
 * `<Box>` with the same props — non-windowing consumers don't pay
 * for opting into a layer they don't use.
 */
const LAYER_BAND: Record<SurfaceLayer, number> = {
  base: 0,
  docked: 100,
  overlay: 1000,
  dropdown: 2000,
  modal: 3000,
  popover: 4000,
  tooltip: 5000,
  'drag-ghost': 6000,
}

/**
 * Resolve a Surface's effective z-index from the `layer` + `zIndex`
 * props.
 *
 *   explicit zIndex (number)        → that number wins
 *   no layer prop, no zIndex        → undefined (omit zIndex attr)
 *   layer='base', no zIndex         → undefined (band value is 0,
 *                                     no point emitting the attr)
 *   layer=other, no zIndex          → the named band's number
 *
 * Returning `undefined` for the `base`/no-layer case is load-bearing:
 * the React shell spreads `zIndex: undefined` onto its style object,
 * which React + the reconciler treat as "don't set this prop." That
 * keeps `<Surface>` (no layer, no zIndex) output identical to plain
 * `<Box>`, preserving the no-surprises swap promise the migration of
 * `<Draggable>` and `<Resizable>` depends on.
 *
 * Note: `zIndex` on the underlying ink-box is silently ignored by the
 * renderer for non-absolute nodes (`hit-test.ts` / `render-node-to-output.ts`
 * gate on `position === 'absolute'`). This function doesn't gate on
 * position — that's the caller's concern. We only resolve the value
 * the caller will then apply (or have ignored by the renderer per
 * existing semantics).
 */
export function resolveZIndex(
  layer: SurfaceLayer | undefined,
  explicit: number | undefined,
): number | undefined {
  if (typeof explicit === 'number') return explicit
  if (!layer || layer === 'base') return undefined
  return LAYER_BAND[layer]
}
