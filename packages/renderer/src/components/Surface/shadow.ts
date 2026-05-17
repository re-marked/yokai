/**
 * Drop-shadow cell math for `<Surface elevation>`. Pure — no React,
 * no DOM, no terminal IO. The renderer (`render-node-to-output.ts`)
 * consumes this function once per absolute-positioned Surface with
 * `elevation > 0` and paints each returned cell with a single
 * reserved dim color slot.
 *
 * Visual model: a classic drop shadow offset 1 cell down-right of
 * the Surface's rect. Elevation controls the BAND THICKNESS:
 *
 *   elev=1  one-cell-thick L-shape: 1 col right + 1 row below
 *   elev=2  two cells thick on each side
 *   …
 *   elev=5  five cells thick
 *
 * The shadow occupies the union of two rectangles:
 *
 *   right strip   cols [x+w, x+w+t),   rows [y+1, y+h+t)
 *   bottom strip  rows [y+h, y+h+t),   cols [x+1, x+w+t)
 *
 * The strips overlap at the bottom-right corner (where the L turns).
 * The +1 row/col offset prevents the shadow from appearing above /
 * to the left of the surface — terminal drop shadows look natural
 * coming from a notional top-left light source.
 *
 * Each cell carries a `dim` level (1..elevation) that records the
 * cell's distance from the surface edge — innermost cells dim=1,
 * outermost dim=elevation. v1 paints them all with a single dim
 * color, but the field is retained for future multi-step shading
 * (e.g. multiple reserved color slots) without an API change.
 */

import type { SurfaceElevation } from './types.js'

/** Rectangle in screen cells. Half-open: `x` to `x+width`, `y` to `y+height`. */
export type ShadowRect = {
  x: number
  y: number
  width: number
  height: number
}

/** One shadow cell to paint. `dim` is 1 (closest to surface) to `elevation`
 *  (furthest). Use as a hint for future shading; v1 paints all the same. */
export type ShadowCell = {
  col: number
  row: number
  dim: number
}

/**
 * Compute the list of shadow cells for a rect at the given elevation.
 *
 *   elevation = 0   → empty list (no paint pass; renderer skips entirely)
 *   elevation 1..5  → L-shaped band of cells; see module docstring for
 *                     the exact geometry
 *
 * The function:
 *   - returns nothing for degenerate rects (width <= 0 or height <= 0)
 *     — there's no surface to cast a shadow from
 *   - returns nothing for elevation = 0 — the no-shadow fast path
 *   - returns nothing for negative or absent rects (defensive)
 *   - de-duplicates the right-strip / bottom-strip overlap at the
 *     corner, so each cell appears exactly once
 *   - assigns `dim` = max(distance from surface right edge, distance
 *     from surface bottom edge) — corner cells get the larger value,
 *     matching what visual intuition expects for an L-shaped shadow
 *
 * Callers (currently only `render-node-to-output.ts`) are responsible
 * for clipping the returned cells against the parent's visible bounds.
 * shadowCells emits the full geometric L; the renderer applies
 * existing cell-bounds checks via `output.write`.
 */
export function shadowCells(rect: ShadowRect, elevation: SurfaceElevation): ShadowCell[] {
  if (elevation <= 0) return []
  if (rect.width <= 0 || rect.height <= 0) return []
  const t = elevation
  const x = rect.x
  const y = rect.y
  const w = rect.width
  const h = rect.height
  const cells: ShadowCell[] = []
  // Right strip — cols [x+w, x+w+t), rows [y+1, y+h+t).
  // Each cell's horizontal distance from the surface's right edge is
  // (col - (x+w) + 1); cells with the same distance share a dim level.
  for (let c = x + w; c < x + w + t; c++) {
    for (let r = y + 1; r < y + h + t; r++) {
      const dimByRight = c - (x + w) + 1
      // If the cell is also in the bottom band (corner overlap), its
      // dim is the larger of the two distances — visually consistent
      // with corner cells being further from BOTH edges.
      const dimByBottom = r >= y + h ? r - (y + h) + 1 : 0
      cells.push({ col: c, row: r, dim: Math.max(dimByRight, dimByBottom) })
    }
  }
  // Bottom strip — rows [y+h, y+h+t), cols [x+1, x+w) (corner already
  // captured by the right strip above). Each cell's vertical distance
  // from the surface's bottom edge is (row - (y+h) + 1).
  for (let r = y + h; r < y + h + t; r++) {
    for (let c = x + 1; c < x + w; c++) {
      const dimByBottom = r - (y + h) + 1
      cells.push({ col: c, row: r, dim: dimByBottom })
    }
  }
  return cells
}
