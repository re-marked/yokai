/**
 * Pure cell-math tests for `shadowCells`. Each scenario pins the
 * exact cell list emitted for a known rect + elevation so renderer
 * changes that consume the function can't drift the visible shadow
 * geometry without a failing test here.
 *
 * The shadow is asymmetric (down-right offset, classic drop shadow);
 * the math is non-obvious enough that random tweaks can produce a
 * differently-shaped band, so we keep these tests exhaustive on
 * geometry and decorative on dim levels.
 */

import { describe, expect, it } from 'vitest'
import { type ShadowCell, shadowCells } from './shadow.js'

/** Return cells sorted by (row, col) for stable equality assertions. */
function sortCells(cells: ShadowCell[]): ShadowCell[] {
  return cells.slice().sort((a, b) => a.row - b.row || a.col - b.col)
}

describe('shadowCells — degenerate inputs', () => {
  it('returns [] for elevation 0', () => {
    expect(shadowCells({ x: 0, y: 0, width: 5, height: 5 }, 0)).toEqual([])
  })

  it('returns [] for zero width', () => {
    expect(shadowCells({ x: 0, y: 0, width: 0, height: 5 }, 2)).toEqual([])
  })

  it('returns [] for zero height', () => {
    expect(shadowCells({ x: 0, y: 0, width: 5, height: 0 }, 2)).toEqual([])
  })

  it('returns [] for negative dimensions', () => {
    expect(shadowCells({ x: 0, y: 0, width: -1, height: 5 }, 2)).toEqual([])
    expect(shadowCells({ x: 0, y: 0, width: 5, height: -1 }, 2)).toEqual([])
  })
})

describe('shadowCells — elevation 1 (single-cell L)', () => {
  it('3x3 surface at (1,1) → 5-cell L offset down-right', () => {
    // Expected geometry:
    //   .....
    //   .SSS.
    //   .SSSx   ← right strip, top
    //   .SSSx   ← right strip, bottom
    //   ..xxx   ← bottom strip
    const cells = sortCells(shadowCells({ x: 1, y: 1, width: 3, height: 3 }, 1))
    expect(cells).toEqual([
      { col: 4, row: 2, dim: 1 },
      { col: 4, row: 3, dim: 1 },
      { col: 2, row: 4, dim: 1 },
      { col: 3, row: 4, dim: 1 },
      { col: 4, row: 4, dim: 1 },
    ])
  })

  it('1x1 surface (smallest valid) emits the corner cell only', () => {
    // For a 1x1 surface at (0,0):
    //   right strip: col 1, rows 1..(1+1-1)=1 → empty (rows [1,1))
    //   bottom strip: row 1, cols 1..(1-1)=0 → empty (cols [1,1))
    // Wait — right strip is rows [y+1, y+h+t) = [1, 1+1+1-1) = [1, 2) = {1}. Single row.
    // bottom strip rows [y+h, y+h+t) = [1, 2) = {1}. cols [x+1, x+w) = [1, 1) = empty.
    // So right strip has (1, 1), bottom strip empty.
    const cells = shadowCells({ x: 0, y: 0, width: 1, height: 1 }, 1)
    expect(cells).toEqual([{ col: 1, row: 1, dim: 1 }])
  })

  it('translates with rect origin', () => {
    // Surface 3x3 at (10, 20): cells should shift by (+10, +20) vs the
    // origin-anchored case above.
    const cells = sortCells(shadowCells({ x: 10, y: 20, width: 3, height: 3 }, 1))
    expect(cells).toEqual([
      { col: 13, row: 21, dim: 1 },
      { col: 13, row: 22, dim: 1 },
      { col: 11, row: 23, dim: 1 },
      { col: 12, row: 23, dim: 1 },
      { col: 13, row: 23, dim: 1 },
    ])
  })
})

describe('shadowCells — elevation 2 (two-cell L)', () => {
  it('3x3 surface at (1,1) → 12-cell L', () => {
    // Right strip:   cols 4..5, rows 2..4   (2 × 3 = 6 cells)
    // Bottom strip:  rows 4..5, cols 2..3   (2 × 2 = 4 cells — corner already covered)
    // Plus: bottom strip extends row 5, cols 2..3 (already counted), AND row 5 over cols 4..5 from right strip
    // Wait let me re-derive. The implementation iterates:
    //   right strip:  c in [4, 6),  r in [2, 5)  → 2×3 = 6 cells at cols {4,5} × rows {2,3,4}
    //   bottom strip: r in [4, 6),  c in [2, 4)  → 2×2 = 4 cells at rows {4,5} × cols {2,3}
    //   Plus right strip rows [2,5) includes row 4, but cols 4-5 only.
    //   Bottom strip cols [2,4) is only cols 2-3.
    //   So row 5 only has the bottom strip portion (cols 2-3), the corner-extension to row 5 at cols 4-5
    //   is NOT covered — that's the difference vs a square ring. Re-check the docstring intent.
    //
    // Actually the right strip iterates rows [y+1, y+h+t) = [2, 3+2+1-1) wait
    //   y=1, h=3, t=2 → rows [1+1, 1+3+2) = [2, 6) → 4 rows: 2,3,4,5.
    //   right strip total: cols {4,5} × rows {2,3,4,5} = 8 cells.
    // Bottom strip rows [y+h, y+h+t) = [4, 6) = {4, 5}, cols [x+1, x+w) = [2, 4) = {2, 3}.
    //   bottom strip total: 2×2 = 4 cells.
    // Overlap: bottom strip is at cols {2,3}, right strip at cols {4,5} — no overlap.
    // Grand total: 8 + 4 = 12 cells.
    const cells = sortCells(shadowCells({ x: 1, y: 1, width: 3, height: 3 }, 2))
    expect(cells).toEqual([
      { col: 4, row: 2, dim: 1 },
      { col: 5, row: 2, dim: 2 },
      { col: 4, row: 3, dim: 1 },
      { col: 5, row: 3, dim: 2 },
      { col: 2, row: 4, dim: 1 },
      { col: 3, row: 4, dim: 1 },
      { col: 4, row: 4, dim: 1 },
      { col: 5, row: 4, dim: 2 },
      { col: 2, row: 5, dim: 2 },
      { col: 3, row: 5, dim: 2 },
      { col: 4, row: 5, dim: 2 },
      { col: 5, row: 5, dim: 2 },
    ])
  })

  it('dim levels reach 2 at the outer cells', () => {
    const cells = shadowCells({ x: 1, y: 1, width: 3, height: 3 }, 2)
    const dims = cells.map((c) => c.dim)
    expect(Math.max(...dims)).toBe(2)
    expect(Math.min(...dims)).toBe(1)
  })
})

describe('shadowCells — elevation 5 (max)', () => {
  it("max dim level == elevation", () => {
    const cells = shadowCells({ x: 0, y: 0, width: 10, height: 5 }, 5)
    const dims = cells.map((c) => c.dim)
    expect(Math.max(...dims)).toBe(5)
    expect(Math.min(...dims)).toBe(1)
  })

  it('cell count grows monotonically with elevation', () => {
    const counts = ([1, 2, 3, 4, 5] as const).map(
      (t) => shadowCells({ x: 0, y: 0, width: 10, height: 5 }, t).length,
    )
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThan(counts[i - 1]!)
    }
  })
})

describe('shadowCells — invariants across all elevations', () => {
  it('no shadow cell falls inside the surface rect', () => {
    // The surface itself paints its own cells; the shadow must never
    // overlap them or it would clobber the surface visually.
    for (const t of [1, 2, 3, 4, 5] as const) {
      const rect = { x: 5, y: 3, width: 8, height: 4 }
      const cells = shadowCells(rect, t)
      for (const c of cells) {
        const insideX = c.col >= rect.x && c.col < rect.x + rect.width
        const insideY = c.row >= rect.y && c.row < rect.y + rect.height
        expect(insideX && insideY, `cell (${c.col},${c.row}) at elev ${t} fell inside surface`).toBe(
          false,
        )
      }
    }
  })

  it('cells are unique (no double-counted corner)', () => {
    for (const t of [1, 2, 3, 4, 5] as const) {
      const cells = shadowCells({ x: 0, y: 0, width: 6, height: 4 }, t)
      const seen = new Set<string>()
      for (const c of cells) {
        const key = `${c.col},${c.row}`
        expect(seen.has(key), `duplicate cell (${c.col},${c.row}) at elev ${t}`).toBe(false)
        seen.add(key)
      }
    }
  })

  it('shadow is offset down-right only — no cells above surface top or left of surface left+1', () => {
    // Drop shadow geometry: no shadow cells should appear above the
    // surface's top row, and no shadow cells should appear left of
    // (surface.x + 1) — the +1 reserves the surface's left edge from
    // shadowing.
    for (const t of [1, 2, 3, 4, 5] as const) {
      const rect = { x: 3, y: 4, width: 8, height: 5 }
      const cells = shadowCells(rect, t)
      for (const c of cells) {
        expect(c.row, `shadow cell at row ${c.row} above surface top ${rect.y}`).toBeGreaterThan(
          rect.y,
        )
        expect(c.col, `shadow cell at col ${c.col} left of surface left+1`).toBeGreaterThanOrEqual(
          rect.x + 1,
        )
      }
    }
  })
})
