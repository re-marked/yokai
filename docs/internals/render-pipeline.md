# Render Pipeline

DFS traversal of the layouted DOM into a `Frame`, frame-to-frame diff, and ANSI patch emission.

## Responsibility

Owns the path from "yoga has computed layout" to "ANSI bytes are queued for stdout." This covers tree traversal, paint order, the blit fast path, the `Output` operation queue, the `Screen` cell grid, and the `LogUpdate` diff engine. Does NOT own layout (yoga), event dispatch, or the actual `stdout.write` (that's `ink.tsx` consuming the patch list).

## Pipeline stages

```
DOM (post-layout)
  → renderNodeToOutput()             render-node-to-output.ts
      DFS, paint order, blit fast path, ScrollBox drain, viewport culling
  → Output operation queue           output.ts
      write / clear / blit / clip / shift / noSelect ops
  → Output.get() → Screen            output.ts (two-pass commit), screen.ts
      Pass 1: collect clears + damage
      Pass 2: apply non-clear ops with absoluteClears suppression
  → applySelectionOverlay()          selection.ts (mutates Screen post-render)
  → LogUpdate.render(prev, next)     log-update.ts
      Optional DECSTBM scroll hint fast path
      diffEach over damage region
      ANSI Patch[] emission
  → Patch[] → ink.tsx → stdout
```

Front/back screen buffers are double-buffered. `Renderer` (`renderer.ts:31`) holds one `Output` instance across frames so its `charCache` (tokenize + grapheme cluster cache) persists.

## Key types

| Type | Source | Purpose |
|---|---|---|
| `Frame` | `frame.ts:12` | `{ screen, viewport, cursor, scrollHint?, scrollDrainPending? }`. The unit produced by the renderer and consumed by log-update. |
| `Operation` | `output.ts:60` | Tagged union of `write` / `clip` / `unclip` / `blit` / `clear` / `noSelect` / `shift`. Queued in DFS order, drained in `Output.get()`. |
| `Screen` | `screen.ts:347` | Packed cell grid: one `ArrayBuffer` viewed as `Int32Array` (per-word) + `BigInt64Array` (bulk fill). 2 Int32s per cell — `[charId, packed(styleId, hyperlinkId, width)]`. Holds `damage`, `noSelect`, `softWrap`. |
| `CharPool` / `StylePool` / `HyperlinkPool` | `screen.ts:12,103,48` | Session-lived interning. `StylePool.intern` packs a "visible-on-space" bit into bit 0 of the returned ID so the renderer can skip invisible spaces with one bitmask check. |
| `ScrollHint` | `render-node-to-output.ts:46` | `{ top, bottom, delta }` — emitted by ScrollBox when only its scrollTop changed; consumed by log-update for the DECSTBM fast path. |
| `Patch` | `frame.ts:73` | The diff output unit: `stdout` / `clear` / `clearTerminal` / `cursorHide` / `cursorShow` / `cursorMove` / `cursorTo` / `carriageReturn` / `hyperlink` / `styleStr`. |

## renderNodeToOutput (DFS)

`render-node-to-output.ts:391`. Per node, in tree order:

1. If `display: none`, clear cached rect and return (`:425`).
2. Compute screen-space `(x, y, width, height)` from yoga + parent offset. Absolute nodes with negative `y` clamp to 0 (`:461`).
3. Blit fast path (`:467`): if node is clean, has no `pendingScrollDelta`, has a cached rect that matches current bounds, AND `prevScreen` is available, copy cells from `prevScreen` and skip the subtree. The cached rect comes from `nodeCache.get(node)`; it was written on the previous frame's full-render pass.
4. Otherwise full-render: paint borders / background → recurse into children via `renderChildren`.
5. After render, write fresh `nodeCache` entry for this rect.

### Tree-wide dirty-absolute collection

At ink-root entry, `collectDirtyAbsoluteRects` walks the WHOLE tree once and stores rects of every dirty `position: absolute` node into `globalDirtyAbsoluteRects` (`:70`, populated `:418-421`). `renderChildren` reads this at every level. Tree-wide rather than per-level because `output.ts`'s `absoluteClears` apply globally — a clean child's blit cells could be zeroed by a moving absolute COUSIN's clear, in a different subtree from any per-level overlap check. This was the constrained-drag notch fix; see comments at `render-node-to-output.ts:57-70`.

### Paint order

`renderChildren` (`:1237`) sorts children by effective z-index when ANY absolute child has non-zero `zIndex`. Stable sort preserves DOM order for equal-z ties — the no-zIndex case stays bit-for-bit identical to pre-feature behavior. `effectiveZ(node)` (`:1230`) returns 0 for non-absolute nodes (the `Styles.zIndex` property is silently ignored on relative / in-flow nodes; a dev-mode warning fires from `setStyle` via `warn.ifZIndexWithoutAbsolute`).

Stacking is flat per parent's render group, NOT CSS-stacking-context-global: a nested z-indexed absolute sorts among its siblings inside its parent, not against arbitrary cousins. Recursion gives this for free — each `renderChildren` sorts only direct children.

### Per-cell suppression of stale absolute paint

`output.ts` collects `absoluteClears` (rects from clear ops with `fromAbsolute: true`) in pass 1 (`:280`). In pass 2, every `blit` operation splits its rows into x-segments, skipping the segments covered by any absolute clear (`:371-389`). This stops moving absolutes from leaving stale paint trails when a clean sibling's blit partially overlaps the cleared old rect.

## Output (operation queue)

`output.ts`. Operations are pushed in DFS order during render. `Output.get()` runs the two-pass commit:

- **Pass 1** (`:281`): walks `operations`, picks out `clear` ops, computes their clipped rect, unions into `screen.damage`, and pushes onto `absoluteClears` if `fromAbsolute`. Clears do NOT zero cells — the screen was already zeroed by `resetScreen`. They only widen the damage region so the diff checks those cells.
- **Pass 2** (`:302`): walks `operations` again, processing `clip` / `unclip` / `blit` / `write` / `noSelect` / `shift`. `clip` intersects with the parent clip on the stack (`:316`); `blit` honors active clip + skips per-row segments covered by any active `absoluteClear` (`:354-389`).

`absoluteRectsPrev` / `absoluteRectsCur` (`:54-55`) hold absolute rects across frames for the ScrollBox blit+shift third-pass repair. `prevFrameContaminated` (consumed in `renderer.ts:113`) disables blit when the previous screen was post-mutated (selection overlay, alt-screen reset, force redraw, absolute removal) — blits would copy stale cells.

## Screen (cell grid)

`screen.ts`. Packed Int32Array layout: word0 = `charId`, word1 = `styleId[31:17] | hyperlinkId[16:2] | width[1:0]`. Two views over one `ArrayBuffer`: `Int32Array cells` for per-word access, `BigInt64Array cells64` for bulk fill (`createScreen` at `:432`). Unwritten cells are exactly zero in both words, indistinguishable from explicitly-cleared cells — intentional, so `diffEach` compares raw integers without normalization.

`noSelect: Uint8Array` (1 byte per cell) marks gutters that should be excluded from text selection. `softWrap: Int32Array` (1 entry per row) encodes word-wrap continuation: `softWrap[r] = N > 0` means row r is a continuation of row r-1 and row r-1's content ends at absolute column N. The encoding is chosen so `shiftRows` preserves continuation semantics across scrolls (`:386-394`).

## LogUpdate (diff)

`log-update.ts`. `render(prev, next, altScreen, decstbmSafe)` returns a `Diff = Patch[]`.

1. **Resize / shrink-from-scrollback short-circuits** (`:133-205`): if viewport shrunk, content shrunk from above-viewport into viewport, or scrollback rows changed — emit `fullResetSequence_CAUSES_FLICKER` (the function name encodes the consequence).
2. **DECSTBM scroll hint** (`:156-172`): when `altScreen && next.scrollHint && decstbmSafe`, emit `setScrollRegion(top+1, bottom+1) + (csiScrollUp(delta) | csiScrollDown(-delta)) + RESET_SCROLL_REGION + CURSOR_HOME`. Mutates `prev.screen` via `shiftRows` so the diff loop below naturally finds only the scrolled-in rows. Skipped when `decstbmSafe === false` (no DEC 2026 / BSU/ESU available — would render an intermediate state).
3. **Diff loop** (`:286`): `diffEach(prev.screen, next.screen, callback)` walks the damage region; per changed cell, the callback emits cursor moves, hyperlink transitions, style transitions (via `stylePool.transition(fromId, toId)` cached pre-serialized strings), and the cell text. Spacers (`SpacerTail`, `SpacerHead`) are skipped — the terminal advances 2 cols on the wide head. Empty cells with no removed content are skipped to avoid trailing-space wraps.
4. **Cursor restore** (`:368-405`): alt-screen no-ops (next frame's CSI H anchors); main screen emits CR + LF rows to advance to `next.cursor.y` since cursor moves can't create lines.

## prevFrameContaminated

`renderer.ts:23-27`. Set true after:
- Selection overlay mutated the returned screen buffer (`ink.tsx`, post-render).
- `resetFramesForAltScreen()` replaced screens with blanks.
- `forceRedraw()` reset to 0×0.
- An absolute-positioned node was removed (consumed via `consumeAbsoluteRemovedFlag` at `renderer.ts:112`).

When true, `prevScreen` is NOT passed to `renderNodeToOutput` — every node full-renders. This is the cost of the selection overlay mutating a buffer the next frame would otherwise blit from.

## Invariants

- `prevScreen` passed to `renderNodeToOutput` MUST be the front buffer from the prior frame, untouched by any post-render mutation. Violations corrupt blits silently.
- `nodeCache.get(node)` returns the rect FROM THE PREVIOUS RENDER. A node renders, writes its cache, and on the NEXT frame the blit-fast-path checks current-bounds against this cached rect. Don't read it expecting current-frame bounds.
- `globalDirtyAbsoluteRects` is reset at every ink-root entry (`render-node-to-output.ts:418`). It must be populated BEFORE any `renderChildren` call descends, otherwise per-level overlap checks miss cross-subtree contamination.
- The `Output` two-pass commit MUST run pass 1 to completion before pass 2 starts. Interleaving causes blits to escape clears that hadn't been collected yet.
- `Screen.cells` and `Screen.cells64` MUST be views over the same `ArrayBuffer`. Any reallocation in `resetScreen` must update both (`screen.ts:494-496`).

## Common pitfalls

- Mutating the screen buffer after `Renderer` returned the frame, without setting `prevFrameContaminated` for the next frame. Next frame blits from contaminated cells.
- Adding a node-level cache or memo without invalidating it on `markDirty`. The renderer already gates on `node.dirty` for blit; a parallel cache must follow the same dirty signal or it'll go stale within one frame.
- Calling `output.write` / `output.clear` outside the DFS pass. Operations after `Output.get()` is called are silently dropped; operations before the right `clip` / `unclip` boundary land in the wrong clip context.
- Reading `cell.char` directly off the packed array — go through `cellAt(screen, x, y)` so the `CharPool.get(charId)` lookup happens.
- Treating `softWrap[r]` as boolean. It's an Int32 with the content-end column encoded; `> 0` is the continuation predicate.

## Source

- Primary: `packages/renderer/src/render-node-to-output.ts`, `output.ts`, `screen.ts`, `log-update.ts`, `frame.ts`, `renderer.ts`
- Tests: `packages/renderer/src/render-node-to-output.test.ts` (paint order, z-index, overlap)
- Related: `packages/renderer/src/node-cache.ts` (`nodeCache`, `pendingClears`, `consumeAbsoluteRemovedFlag`), `packages/renderer/src/ink.tsx` (frame loop, selection overlay site)
