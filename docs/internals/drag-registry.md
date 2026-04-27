# Drag Registry

Module-scope coordinator for `<Draggable>` → `<DropTarget>` interactions, with one active drag at a time.

## Responsibility

Owns the registered drop-target set, the active-drag flag, the per-tick enter / over / leave dispatch against the cursor, and the topmost-wins drop selection. Does NOT own gesture capture (that's `App.activeGesture` in `ink.tsx`), the dragged data's payload semantics, or visual drag chrome.

## Why module-scope

The draggable / drop-target relationship is global to the App. A user dragging from container A can drop on a target in container B with no DOM-tree containment relating them. React context is therefore the wrong tool — there's no shared ancestor that captures both. The registry is a module-level `Map<symbol, DropTargetEntry>` plus an `activeDrag: { data } | null` slot.

Gestures are exclusive at the App level (only one mouse, one pointer), so "one active drag at a time" is a hard limit, not a simplification.

## Key types

```ts
type DropInfo = {
  data: unknown
  cursor: { col: number; row: number }   // screen-cell, 0-indexed
  local:  { col: number; row: number }   // cursor minus target top-left
}

type DropTargetCallbacks = {
  accept?:       (data: unknown) => boolean
  onDragEnter?:  (info: DropInfo) => void
  onDragOver?:   (info: DropInfo) => void
  onDragLeave?:  () => void
  onDrop?:       (info: DropInfo) => void
}

type DropTargetEntry = {
  getNode:      () => DOMElement | null      // lazy ref read
  getCallbacks: () => DropTargetCallbacks    // fresh-per-tick handlers
}
```

The two getters are the load-bearing detail. `getNode` is lazy because refs are populated post-mount (registration runs in `useEffect`); it returns `null` during transient detach (reorder), and the registry skips null entries. `getCallbacks` returns the LATEST handler bundle on each tick — the registered entry holds a stable identity for the registration's lifetime, but the values it returns track the component's most recent props.

## Module state

| Variable | Source | Purpose |
|---|---|---|
| `targets: Map<symbol, DropTargetEntry>` | `drag-registry.ts:60` | All registered drop targets, keyed by an opaque symbol. |
| `activeDrag: { data } | null` | `:61` | The currently-dragged payload, or null. |
| `containingPrev: Set<symbol>` | `:62` | Targets the cursor was inside on the previous tick — used to compute leave deltas. |

## Public API

| Function | Source | Purpose |
|---|---|---|
| `registerDropTarget(entry)` | `:66` | Returns an opaque `symbol` id. Called from `<DropTarget>` mount effect. |
| `unregisterDropTarget(id)` | `:72` | Cleanup. Removes from `targets` AND `containingPrev`. |
| `startDrag(data)` | `:89` | Begin tracking. Called by `<Draggable>` on the FIRST motion of a press (not at press time — a press without motion does not engage targets). |
| `isDragActive()` | `:95` | True iff `activeDrag !== null`. |
| `tickDrag(col, row)` | `:107` | Per-motion. Walks targets, fires enter / over / leave deltas. |
| `dispatchDrop(col, row)` | `:149` | At release. Fires `onDrop` on the topmost containing target that accepts. Returns true iff any target received the drop. |
| `endDrag()` | `:190` | Idempotent end. Fires `onDragLeave` on remaining containing targets. |
| `_resetDragRegistryForTesting()` | `:79` | Test-only state reset. Not public API. |

## Lifecycle

```
press                          (no registry call — gesture not yet a drag)
  │
  │ first motion
  v
startDrag(data)                 activeDrag = { data }, containingPrev = ∅
  │
  │ each subsequent motion
  v
tickDrag(col, row)              for each target: in-rect + accept(data)?
                                  → enter (if not in prev), over
                                for each in prev not in now: leave
                                containingPrev = containingNow
  │
  │ release
  v
dispatchDrop(col, row)          collect candidates → sort by (z, depth) DESC
                                → fire onDrop on top.
endDrag()                       fire onDragLeave on stragglers, activeDrag = null
```

`startDrag` MUST happen before any `tickDrag`. `tickDrag` and `dispatchDrop` early-return when `!activeDrag`. `endDrag` is idempotent.

## Topmost-wins drop dispatch

`dispatchDrop` (`:149`) collects all in-rect, accepting candidates, then sorts by `(z DESC, depth DESC)`:

- `z = node.style.position === 'absolute' ? (node.style.zIndex ?? 0) : 0` — matches the renderer's `effectiveZ` in `render-node-to-output.ts`.
- `depth = nodeDepth(node)` — walks `parentNode` to root.

Highest z wins; on tie, deeper-in-tree wins. Mirrors the renderer's paint order so the user's eye and the drop target see the same winner.

## Snapshot iteration

`tickDrag` iterates `targets` (a Map) directly — Map's iterator handles concurrent deletion in modern JS. The leave loop iterates `containingPrev` (a Set) which is then cleared and repopulated. A target unsubscribing via `onDragLeave` removes itself from `targets` mid-iteration; the Map iterator skips it cleanly.

`endDrag` fires `onDragLeave` on remaining `containingPrev` entries by reading callbacks fresh from `targets.get(id)?.getCallbacks()` — handles the case where the target unmounted between the last tick and the release.

## Hit testing

Per-target rect lookup: `nodeCache.get(node)` reads the rect cached on the previous frame. The cursor-in-rect check is `col >= rect.x && col < rect.x + rect.width` (and same for row). `nodeCache` is populated by the render pipeline; `<DropTarget>` re-renders on data change keep the cache fresh. A target whose node has not yet been rendered (no cache entry) is silently skipped — first frame after mount may miss enter events; `<DropTarget>` accepts this rather than synchronously laying out.

## Invariants

- Only one drag active at a time. Calling `startDrag` while another is active overwrites `activeDrag.data` and clears `containingPrev` — caller is responsible for not doing this. `<Draggable>` enforces it via `App.activeGesture` exclusivity at the App level.
- `containingPrev` must mirror the most recent `tickDrag`'s "containing now" set. Skipping `containingPrev` updates produces stuck-hover state.
- Callbacks read via `entry.getCallbacks()` MUST be re-read each tick. Capturing the bundle once at registration freezes handlers — the subscribing component's re-renders are then ignored.
- `getNode()` may return null. The registry MUST handle null gracefully (skip the entry); throwing on null leaks dead targets across reorder cycles.

## Common pitfalls

- Calling `startDrag` on press instead of first-motion. A press-then-release with no motion will then fire `endDrag`'s leave callbacks against any target the cursor happens to be over, even though the user never dragged anything.
- Forgetting to call `endDrag` in error / cancel paths. `activeDrag` stays set; the next press's first motion enters a stuck state.
- Reading `nodeCache.get(node)` when node is mid-mount. Returns `undefined` — the registry's null-check covers it but custom code might not.
- Computing z-index without checking `position === 'absolute'`. The `Styles.zIndex` field is silently ignored on non-absolute nodes (see [render-pipeline](./render-pipeline.md)) — `dispatchDrop` mirrors that exactly.

## Source

- Primary: `packages/renderer/src/drag-registry.ts`
- Tests: `packages/renderer/src/drag-registry.test.ts`
- Components: `packages/renderer/src/components/Draggable.tsx`, `packages/renderer/src/components/DropTarget.tsx`
- Rect source: `packages/renderer/src/node-cache.ts` (`nodeCache`)
- Gesture exclusivity: `packages/renderer/src/ink.tsx` (`App.activeGesture`, `App.handleMouseEvent`)
