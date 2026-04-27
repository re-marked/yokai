# Architecture

Module-level layout of the yokai monorepo and the renderer's internal subsystems.

## Responsibility

Defines what each package owns, the dependency direction between them, and the named subsystems inside `@yokai/renderer`. Does NOT cover individual algorithms — see the per-subsystem pages.

## Packages

| Package | Owns |
|---|---|
| `@yokai/shared` | Pure-TS Yoga port (`shared/src/yoga-layout/`), logging (`logger.ts`, `log.ts`, `debug.ts`), env helpers (`env.ts`, `envUtils.ts`), `stringWidth`, `sliceAnsi`, grapheme segmenter, `intl`, `semver`. No React, no terminal I/O, no DOM. |
| `@yokai/renderer` | React reconciler, virtual DOM, layout glue, render pipeline, terminal I/O, event system, components, hooks. |

Dependency direction is one-way: `renderer → shared`. `shared` never imports from `renderer`. The shared package is a sibling, not a sub-tree.

## Build order

Shared first, then renderer. `pnpm build` at the workspace root resolves the order via the workspace dependency graph; running renderer's `tsup` against unbuilt shared types fails. CI (`.github/workflows/ci.yml`) preserves this order.

## Renderer subsystems

| Subsystem | File(s) | Purpose |
|---|---|---|
| Reconciler | `reconciler.ts` | React 19 host config — host instance lifecycle, commit phase hooks, event-priority resolution. |
| DOM | `dom.ts` | Virtual element/text node graph, dirty propagation, attribute/style mutation. |
| Yoga (in shared) | `shared/src/yoga-layout/index.ts` | Flexbox layout. Exposed to renderer via `layout/engine.ts`. |
| Render-to-output | `render-node-to-output.ts` | DFS traversal, paint order, blit fast path, ScrollBox drain, viewport culling. |
| Output | `output.ts` | Operation queue (write/clear/blit/clip/shift), two-pass commit, absolute-clear suppression. |
| Screen | `screen.ts` | Packed cell grid (`Int32Array` / `BigInt64Array`), `CharPool`, `StylePool`, `HyperlinkPool`, `noSelect` and `softWrap` bitmaps. |
| Log-update | `log-update.ts` | Frame-to-frame diff, ANSI patch generation, DECSTBM scroll hint, full-reset detection. |
| Frame | `frame.ts` | Frame envelope (screen + viewport + cursor + scrollHint), `shouldClearScreen`, `Patch` types. |
| Renderer | `renderer.ts` | One-shot factory that wires Output to renderNodeToOutput; produces a `Frame` from the live DOM. |
| Focus | `focus.ts` | `FocusManager`, focus stack, per-node + global subscribers. See [focus-manager](./focus-manager.md). |
| Hit-test | `hit-test.ts` | Cell → DOM-node lookup for mouse routing. |
| Dispatch | `events/dispatcher.ts`, `events/*-event.ts` | Capture/bubble event dispatch, gesture capture, React update-priority bridge. |
| Drag-registry | `drag-registry.ts` | Module-scope drop-target registry. See [drag-registry](./drag-registry.md). |
| Selection | `selection.ts` | Text selection state machine (anchor/focus/virtual rows), drag-to-scroll capture, overlay paint. See [selection-state-machine](./selection-state-machine.md). |
| Ink (entry) | `ink.tsx` | `Ink` class — frame lifecycle, alt-screen, signal handling, selection coordination, throttling. |

## Public surface

`packages/renderer/src/index.ts` is the only public entry point declared in `packages/renderer/package.json:14-19`. Anything not re-exported there is internal and unstable.

## Source

- `CLAUDE.md` (top-level) — load-bearing invariants and rationale.
- `packages/renderer/src/index.ts`
- `packages/renderer/package.json`
- `packages/shared/src/index.ts`
