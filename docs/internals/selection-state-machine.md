# Selection State Machine

Text-selection state for fullscreen mode — anchor / focus / virtual rows tracked outside React, with drag-to-scroll capture and post-render overlay paint.

## Responsibility

Owns selection state across mouse-down → drag → up, drag-to-scroll row capture, keyboard-scroll selection translation, copy-text extraction, and the per-frame overlay paint into the screen buffer. Does NOT own mouse-event routing (that's `App.handleMouseEvent` in `ink.tsx`), clipboard write (consumer responsibility — `useSelection().copy` returns the selected text; consumers write to the system clipboard themselves), or the visual selection style (themed via `StylePool.setSelectionBg`).

## Why state lives outside React

Selection state is mutated directly by mouse-event handlers and read by `applySelectionOverlay` after every render. Storing it in React state would (a) trigger a re-render per drag motion (60+/sec), and (b) lose state on any concurrent React update that re-mounts the owning component. The state object is created once on `Ink` construction and mutated in place; React subscribers (`useHasSelection`) are notified via a separate listener channel.

## Key types

```ts
type SelectionState = {
  anchor: Point | null            // mouse-down position
  focus: Point | null             // current drag position; null = bare click
  isDragging: boolean             // between mouse-down and mouse-up
  anchorSpan: { lo, hi, kind: 'word' | 'line' } | null  // word/line extend mode
  scrolledOffAbove: string[]      // captured rows above viewport (drag down)
  scrolledOffBelow: string[]      // captured rows below viewport (drag up)
  scrolledOffAboveSW: boolean[]   // soft-wrap bits, parallel to ↑
  scrolledOffBelowSW: boolean[]
  virtualAnchorRow?: number       // pre-clamp anchor row
  virtualFocusRow?: number        // pre-clamp focus row
  lastPressHadAlt: boolean        // SGR alt-modifier on press
}
```

`Point = { col: number; row: number }`. Coordinates are screen-buffer cells, 0-indexed.

## Public API

| Function | Source | Purpose |
|---|---|---|
| `createSelectionState()` | `selection.ts:65` | Initial state. |
| `startSelection(s, col, row)` | `:79` | Mouse-down. Sets `anchor`, leaves `focus = null` (so a bare click doesn't highlight). |
| `updateSelection(s, col, row)` | `:96` | Mouse-move while dragging. First-motion-at-anchor is a no-op (filters mode-1002 jitter). |
| `finishSelection(s)` | `:110` | Mouse-up. Keeps `anchor`/`focus` so highlight persists for copy. |
| `clearSelection(s)` | `:116` | Esc / explicit clear. |
| `selectWordAt(s, screen, col, row)` | `:230` | Double-click — expands to same-class char run. |
| `selectLineAt(s, screen, row)` | `:351` | Triple-click — full row span. |
| `extendSelection(s, screen, col, row)` | `:368` | Word/line drag-extend respecting `anchorSpan`. |
| `moveFocus(s, col, row)` | `:410` | Keyboard nudge — clears `anchorSpan` and `virtualFocusRow`. |
| `shiftSelection(s, dRow, minRow, maxRow, width)` | `:438` | Keyboard scroll — moves anchor + focus, virtual-row tracked. |
| `shiftAnchor(s, dRow, minRow, maxRow)` | `:529` | Drag-to-scroll — moves only anchor (focus stays at mouse). |
| `shiftSelectionForFollow(s, dRow, minRow, maxRow)` | `:576` | Sticky/auto-follow scroll — moves both ends, clears if both go above viewport. Returns `true` if cleared. |
| `hasSelection(s)` | `:622` | `s.anchor && s.focus`. |
| `selectionBounds(s)` | `:630` | Normalized `{ start, end }` with `start ≤ end`. |
| `isCellSelected(s, col, row)` | `:644` | Per-cell hit test for overlay. |
| `getSelectedText(s, screen)` | `:703` | Copy-text. Joins `scrolledOffAbove` + on-screen rows + `scrolledOffBelow`, respecting `softWrap` continuations. |
| `captureScrolledRows(s, screen, firstRow, lastRow, side)` | `:743` | Capture rows about to scroll out, BEFORE `scrollBy` overwrites them. |
| `applySelectionOverlay(screen, selection, stylePool)` | `:823` | Mutate cell styles in-place to paint the highlight. |

## State transitions

```
                    ┌──────────────────────────────────┐
                    │            (no selection)         │
                    └──┬─────────────────────┬─────────┘
        startSelection │                     │ clearSelection
                       v                     │
       ┌──────────────────────┐              │
       │ anchor set, focus=∅  │              │
       │   isDragging=true    │              │
       └──────┬───────────────┘              │
       update │ (col,row ≠ anchor)           │
              v                              │
       ┌──────────────────────┐              │
       │ anchor + focus set   │──────────────┤
       │   isDragging=true    │ finishSel    │
       └──┬───────────────────┘              │
          │ scroll during drag               │
          v                                  │
       ┌──────────────────────┐              │
       │ + scrolledOff*       │              │
       │ + virtualAnchorRow   │              │
       └──┬───────────────────┘              │
          │ finishSelection                  │
          v                                  │
       ┌──────────────────────┐              │
       │ anchor + focus set   │──────────────┤
       │   isDragging=false   │  clearSel    │
       └──────────────────────┘              │
                                             v
```

Bare click (no motion) sets `anchor` then `finishSelection` with `focus = null` — `hasSelection()` returns false, no highlight, no copy.

## Virtual rows (the pre-clamp tracker)

`virtualAnchorRow` / `virtualFocusRow` exist because clamp is destructive. When `shiftSelection` clamps anchor from row 5 to row 0, a subsequent reverse scroll of `+10` would compute `0 + 10 = 10` instead of the true `5 + 10 = 15`. The accumulator (`scrolledOffAbove`) would also stay populated past the row it should have been popped from — so the highlight (which clamps) and the copy text (which reads the accumulator) disagree.

Fix: store the pre-clamp row in `virtualAnchorRow` whenever clamp fires; the next shift reads `virtualAnchorRow ?? anchor.row` as the true position. Both axes are needed because the drag → follow transition hands off to `shiftSelectionForFollow`, which reads both.

The accumulator pop logic in `shiftSelection` (`:455-475`) computes `oldDebt` and `newDebt` against virtual rows; when `newDebt < oldDebt`, the rows are back on-screen and pop from the accumulator end nearest the viewport (newest at end for `above`, newest at front for `below`).

## Drag-to-scroll capture

When the ScrollBox scrolls during a drag, rows about to scroll out of the viewport are captured BEFORE the scroll mutates them:

1. ScrollBox decides to scroll by `delta`.
2. `ink.tsx` calls `captureScrolledRows(s, frontScreen, firstRow, lastRow, 'above' | 'below')` — `frontScreen` still holds pre-scroll content.
3. Rows are intersected with the selection and pushed into `scrolledOffAbove` / `scrolledOffBelow` along with their soft-wrap bit.
4. The anchor's col is reset to `0` (above) or `width-1` (below) so subsequent captures and final `getSelectedText` don't re-apply a stale col bound. `anchorSpan` BOTH cols are reset (not just the near side) to handle drag-direction reversal after a blocked scroll (`:735-738`).
5. `shiftAnchor` translates the anchor row.

`scrolledOffAbove` pushes newest at END (closest to on-screen). `scrolledOffBelow` unshifts newest at FRONT. `getSelectedText` then reads `above + on-screen + below` in that order.

## applySelectionOverlay

`selection.ts:823`. Called from `ink.tsx` AFTER `Renderer` produces a frame, BEFORE `LogUpdate.render`. Walks the selection rect and calls `setCellStyleId(screen, col, row, stylePool.withSelectionBg(cell.styleId))` per cell. Skips `noSelect` cells so gutters stay visually unchanged (clear they're not part of copy).

This MUTATES the screen buffer that the renderer just produced. Consequence: that buffer cannot be used as `prevScreen` for the next frame's blit — `prevFrameContaminated` is set true. The diff loop in log-update treats the restyled cells as ordinary changes; LogUpdate stays a pure diff engine with no selection awareness.

`StylePool.withSelectionBg` (`screen.ts:229`) interns `base + selection-bg` once per base styleId; the cache is keyed by base only and cleared when `setSelectionBg` is called with a new color (theme change). On drag, the per-cell work is one Map lookup + one packed-int write.

## Invariants

- `focus = null` means "no extent" — `hasSelection`, `selectionBounds`, `isCellSelected` all early-return on `!s.focus`. `anchor` alone never highlights.
- After clamp, `virtualAnchorRow` (or `virtualFocusRow`) MUST be set to the pre-clamp row. Skipping this leaves the next reverse-shift computing from the clamped row → off-by-N → highlight diverges from copy.
- Accumulator length ≤ debt at any point. `shiftSelection` truncates if length exceeds debt (`:484-493`) — handles the case where `moveFocus` cleared `virtualFocusRow` without trimming.
- `captureScrolledRows` MUST run against the PRE-SCROLL screen buffer. Running after `scrollBy` mutates the buffer captures rows that have already been overwritten.
- `applySelectionOverlay` MUST run after `Renderer` and before `LogUpdate.render`. Running before is overwritten by full-render writes; running after is irrelevant (the diff already shipped).
- `prevFrameContaminated` MUST be set after `applySelectionOverlay` mutates the front buffer, otherwise next frame's blits copy inverted cells.

## Common pitfalls

- Treating `anchor.row` / `focus.row` as the source of truth for "where the selection is now." Use `virtualAnchorRow ?? anchor.row` if you're computing offsets across scrolls.
- Forgetting that `scrolledOffAbove` and `scrolledOffAboveSW` are PARALLEL arrays. Mutating one without the other corrupts soft-wrap detection in `getSelectedText`.
- Reading `selectionBounds()` and assuming `start.col` is always ≤ `end.col`. Normalization is by row first, then col within the row — a top-right-to-bottom-left selection has `start.col > end.col` on the start row.
- Calling `clearSelection` from inside `applySelectionOverlay`. The overlay is structural; clearing during it leaves the next frame's first read seeing `null` mid-paint.
- Adding a new field to `SelectionState` and forgetting to reset it in `startSelection` AND `clearSelection`. Stale state across selection cycles is the most common selection bug.

## Source

- Primary: `packages/renderer/src/selection.ts`
- Tests: `packages/renderer/src/selection.test.ts` (lifecycle, normalization, shift round-trips)
- Coordination: `packages/renderer/src/ink.tsx` (mouse routing, capture call site, overlay invocation)
- Style interning: `packages/renderer/src/screen.ts` (`StylePool.withSelectionBg`, `setSelectionBg`)
- Hook: `packages/renderer/src/hooks/use-selection.ts` (React subscribers)
