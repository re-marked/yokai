# Rendering

Yokai converts a React tree into the minimal ANSI patch needed to update the terminal each frame.

## Pipeline

```
React component tree
  -> Reconciler (React 19 host config)        reconciler.ts
  -> DOM mutation + Yoga layout calc          dom.ts / yoga-layout/index.ts
  -> Tree traversal + text wrapping           render-node-to-output.ts
  -> Screen buffer (cell grid)                screen.ts / output.ts
  -> Frame diff -> ANSI patches               log-update.ts / frame.ts
  -> stdout
```

Each stage is synchronous within a tick. The reconciler commits DOM mutations, Yoga lays them out, the tree is walked into a cell grid, the grid is diffed against the previous frame, and the patch is written.

## Screen buffer

A `Screen` is a flat array of cells indexed by `(x, y)`. Each cell holds:

- A char-pool ID (interned strings; ASCII fast-path uses an `Int32Array`).
- A style-pool ID (foreground, background, bold, dim, etc.).
- An optional hyperlink-pool ID (OSC 8).
- A width tag (`Single`, `WideHead`, `SpacerTail` for CJK and emoji).

Pools are shared across both buffers so cells can be compared by integer ID, not string equality.

## Double buffering

Two `Frame` objects swap each tick: `frontFrame` is what the terminal currently shows; the renderer writes the next frame, then `LogUpdate.render(prev, next)` produces the diff and the buffers swap. Pools are shared between buffers — `blitRegion` copies cell IDs directly.

## Frame diff

`log-update.ts` walks both buffers cell-by-cell:

- Skip runs of unchanged cells.
- For each changed cell, emit a cursor move (`CUP`) only when the cursor is not already at the next write position.
- Emit an SGR change only when the style ID differs from the cursor's current style.
- Emit OSC 8 link enter/exit only at hyperlink boundaries.

Output is `O(changed cells)`, not `O(rows × cols)`. A spinner tick or a one-line stream touches only the cells that changed.

## Damage region

`render-node-to-output.ts` tracks `layoutShifted` per frame — true when any node's yoga-computed rect differs from the previous frame's cached rect, or when a child was removed. When `false`, the diff is bounded by per-row damage extents (left/right column of changes). When `true`, the renderer falls back to a full-screen diff to handle layout shifts safely.

## Scroll hints

When a `<ScrollBox>` changes its `scrollTop` between frames and nothing else moved in its rect, `render-node-to-output.ts` emits a `ScrollHint { top, bottom, delta }`. `log-update.ts` translates this into DECSTBM (`CSI top;bottom r`) plus `SU` / `SD`, letting the terminal scroll the region in hardware instead of rewriting every cell. Alt-screen only.

## See also
- [Layout](../concepts/layout.md)
- [Text](../concepts/text.md)
- [ScrollBox](../components/scrollbox.md)
