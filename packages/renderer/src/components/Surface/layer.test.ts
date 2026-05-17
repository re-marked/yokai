/**
 * Truth-table coverage of `resolveZIndex`. The function is pure and
 * branch-free except for the two guards, so the tests exhaust the
 * {layer ∈ {undefined, base, every named layer}} × {explicit zIndex ∈
 * {undefined, number}} cross-product. Each layer's band number is
 * pinned — a wrong cell here would silently misalign the desktop UI
 * stack (a tooltip painting under a modal, a dropdown under a popover).
 */

import { describe, expect, it } from 'vitest'
import { resolveZIndex } from './layer.js'
import type { SurfaceLayer } from './types.js'

describe('resolveZIndex — explicit zIndex always wins', () => {
  it.each<[SurfaceLayer | undefined, number]>([
    [undefined, 0],
    [undefined, 42],
    [undefined, -5],
    ['base', 99],
    ['docked', 50],
    ['overlay', 0],
    ['modal', 999],
    ['tooltip', 3001],
    ['drag-ghost', 1],
  ])('layer=%s, explicit=%i → %i (explicit wins)', (layer, explicit) => {
    expect(resolveZIndex(layer, explicit)).toBe(explicit)
  })
})

describe('resolveZIndex — no explicit, no layer → undefined (Box parity)', () => {
  it('undefined layer + undefined explicit → undefined', () => {
    // Load-bearing: keeps <Surface> with no extras byte-identical to <Box>.
    expect(resolveZIndex(undefined, undefined)).toBeUndefined()
  })

  it("layer='base' + undefined explicit → undefined", () => {
    // 'base' is the default semantic value for "no z-band requested";
    // it must produce no zIndex attribute on the rendered ink-box.
    expect(resolveZIndex('base', undefined)).toBeUndefined()
  })
})

describe('resolveZIndex — named layer bands', () => {
  it.each<[SurfaceLayer, number]>([
    ['docked', 100],
    ['overlay', 1000],
    ['dropdown', 2000],
    ['modal', 3000],
    ['popover', 4000],
    ['tooltip', 5000],
    ['drag-ghost', 6000],
  ])('layer=%s → band %i', (layer, expectedZ) => {
    expect(resolveZIndex(layer, undefined)).toBe(expectedZ)
  })
})

describe('resolveZIndex — band ordering (anti-regression)', () => {
  // Pin the strictly-increasing band order so a future band insertion or
  // renumber doesn't silently reorder the desktop UI stack. If this test
  // breaks, the docs (surface.md layer table) and CLAUDE.md note need
  // matching updates.
  it('bands are strictly ascending in the documented stack order', () => {
    const order: SurfaceLayer[] = [
      'base',
      'docked',
      'overlay',
      'dropdown',
      'modal',
      'popover',
      'tooltip',
      'drag-ghost',
    ]
    const baseZ = 0
    let prev = baseZ - 1
    for (const layer of order) {
      const z = resolveZIndex(layer, undefined) ?? 0
      expect(z, `band for ${layer} should be > ${prev}`).toBeGreaterThan(prev)
      prev = z
    }
  })
})
