# Yoga Port

Pure-TypeScript reimplementation of Meta's Yoga flexbox engine, sized to the subset yokai uses.

## Responsibility

Owns flexbox layout: style storage, dirty propagation, `calculateLayout` traversal with multi-pass clamping, and per-node measurement caches. Does NOT own painting, terminal I/O, React, or text wrapping (text wrapping happens via `measureFunc` callbacks the renderer installs, not inside the layout engine).

## Why pure TS

- Boot cost. The WASM Yoga build adds ~1ms+ to startup and a non-trivial binary chunk; yokai targets sub-tick startup.
- Single-binary distribution. No native loader, no `wasm` MIME, no Node version coupling.
- Debuggability. The dirty-cache machinery (`_cGen`, `_fbGen`, `_hasL`) is hot enough that being able to step into TS — and grep `_cIn` writes — has paid for itself repeatedly.

The port is at `packages/shared/src/yoga-layout/index.ts`. Top-of-file comments enumerate features implemented for spec parity but not used by Ink (margin: auto, multi-pass clamping, flex-wrap, align-content, display: contents, baseline) and features not implemented (aspect-ratio, content-box box-sizing, RTL).

## Deviations from upstream

| Property | Upstream default | Yokai default | Why |
|---|---|---|---|
| `flexShrink` | `1` (web), `0` (yoga C++) | `0` | Matches yoga C++ (the upstream this is a port of), not CSS. Means children don't shrink below their basis unless explicitly given `flexShrink > 0`. |
| `flexDirection` | `Row` (web) | `Column` | Matches yoga C++ default. Terminal UIs are vertical-by-default. |
| `alignContent` | `Stretch` (web) | `FlexStart` | Matches yoga C++ default. |

See `defaultStyle()` at `packages/shared/src/yoga-layout/index.ts:169`.

## Layout calculation

`calculateLayout(width, height, direction)` is invoked once per commit. Call site:

- `packages/renderer/src/ink.tsx` → `onComputeLayout` → calls `node.yogaNode.calculateLayout(...)` on the root.
- The reconciler invokes `onComputeLayout` from `resetAfterCommit` (`reconciler.ts:251`).

Dirty propagation: `markDirty()` (`yoga-layout/index.ts:579`) sets `isDirty_` on `this` and walks `parent` chain until it finds an already-dirty ancestor. Every style mutator on `Node` calls `markDirty()` (the `markDirty()` calls in setters at `:655` onward). The reconciler's `setStyle` / `setAttribute` separately call `dom.markDirty(node)` to bubble the renderer's dirty bit up the DOM, which is independent of the yoga dirty bit (yoga's bit gates layout cache; the DOM's bit gates the blit fast path).

## Caches

Three layered caches. All keyed by INPUTS to the call so different parents asking the same node different questions don't collide.

| Cache | Slots | Fields | Purpose |
|---|---|---|---|
| Layout single-slot (`_hasL`) | 1 | `_lW`, `_lH`, `_lWM`, `_lHM`, `_lOW`, `_lOH`, `_lFW`, `_lFH`, `_lOutW`, `_lOutH` | Hot single-slot for layout passes. Stores BOTH inputs and outputs because `layout.width/height` get mutated by the multi-entry cache. The `_lOut*` outputs were added after the "scrollbox vpH=33→2624" bug — without them a hit returned whatever was last written to `layout`. (`yoga-layout/index.ts:444-459`) |
| Multi-entry layout (`_cIn` / `_cOut`) | 4 | Packed `Float64Array` — 8 inputs + 2 outputs per slot | Ring of additional layout-call answers. Upstream uses 16 slots; 4 covers Ink's dirty-chain depth. Generation-gated via `_cGen`. (`:489-498`) |
| Flex-basis (`_fbBasis`) | 1 | `_fbBasis`, `_fbOwnerW`, `_fbOwnerH`, `_fbAvailMain`, `_fbAvailCross`, `_fbCrossMode` | Cached `computeFlexBasis` result for clean children. The basis only depends on container inner dimensions; if those haven't changed the recursive measure pass is skipped. Generation-gated via `_fbGen`. (`:469-488`) |

### Generation gating

`_cGen` and `_fbGen` are stamped to a module-scope `_generation` counter that increments per `calculateLayout` call. A cached entry from a previous generation is treated as stale — the subtree may have changed (e.g. virtual-scroll mounted new items). Within one generation the cache is fresh because the dirty chain's measure → layout cascade invokes `computeFlexBasis` ≥ 2^depth times per call on fresh-mounted items and the subtree doesn't change between those internal calls. Gating on generation rather than `isDirty_` lets fresh mounts cache-hit after first compute (the comment cites a 105k → 10k visit reduction at `:486-487`).

### Profiling counters

`getYogaCounters()` (`yoga-layout/index.ts:1039`) returns `{ visited, measured, cacheHits, live }`. Reset per `calculateLayout`, except `live` which tracks `_yogaLiveNodes` (constructor `++`, `free()` `--`). Read by `reconciler.ts:257` to log `SLOW_YOGA` events when a layout exceeds 20ms with `CLAUDE_CODE_COMMIT_LOG` set.

## Invariants

- Every style setter MUST call `markDirty()`. If a setter forgets, the dirty cache returns stale results and a layout regression follows that's hard to attribute.
- `_hasL` and `_cIn` MUST store outputs alongside inputs. The `layout.width/height` fields are scratch space — multi-entry cache writes restore them, but a hit on `_hasL` without restored outputs returns whatever the last unrelated call left there.
- `freeRecursive()` is only safe AFTER all references to subtree nodes are nulled. The reconciler enforces this via `clearYogaNodeReferences` before `freeRecursive` (`reconciler.ts:69-78`). Don't call `freeRecursive()` directly — go through `cleanupYogaNode`.
- `_yogaLiveNodes` is the leak detector. Steady-state apps should plateau; monotonic growth means the reconciler's removal path isn't reaching `cleanupYogaNode`.

## Common pitfalls

- Setting `flexShrink: 1` everywhere "to match CSS." This ports a layout bug — children silently collapse under containers that were sized for their natural width.
- Reading `getComputedWidth()` / `getComputedHeight()` before the first `calculateLayout`. Returns NaN. `renderer.ts:48-67` short-circuits to an empty frame in this case.
- Holding a reference to a `Node` after its DOM element was removed. The node's children array is cleared by `free()` but the object itself can linger; reads will return stale layout. Treat the node as opaque after removal.
- Mutating style during a measure callback. The measure pass holds a snapshot of inputs; mid-pass mutation creates a generation skew where some descendants see old style and some see new.

## Source

- Primary: `packages/shared/src/yoga-layout/index.ts` (~2460 lines)
- Enums: `packages/shared/src/yoga-layout/enums.ts`
- Renderer glue: `packages/renderer/src/layout/engine.ts`, `packages/renderer/src/layout/node.ts`, `packages/renderer/src/styles.ts`
- Call sites: `packages/renderer/src/ink.tsx` (`onComputeLayout`), `packages/renderer/src/reconciler.ts:251`
- Counters consumer: `packages/renderer/src/reconciler.ts:257`
