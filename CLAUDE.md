# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository.

## What this repo is

`yokai` — a React terminal renderer used by [claude-corp](https://github.com/re-marked/claude-corp). Pure-TypeScript Yoga flexbox, diff-based screen output, ScrollBox with viewport culling and hardware scroll hints. Forked from [claude-code-kit](https://github.com/minnzen/claude-code-kit), itself a fork of [Ink](https://github.com/vadimdemedes/ink).

Two packages in a pnpm monorepo:
- `@yokai/renderer` — React reconciler, components, event system, terminal I/O
- `@yokai/shared` — pure-TS Yoga port, logging, env helpers

The renderer depends on the shared package, so always build shared first.

## Hard rules

These are non-negotiable. Apply on every commit, every PR, every feature.

### Branching and merging

- **Never commit directly to `main`.** Every change starts on a branch cut from `main`.
- **Open a PR into `main`** when ready.
- **Merge with normal merge commits only.** Never rebase-merge. Never squash-merge. The full commit graph is preserved on purpose — future debugging and refactoring depend on it.

### Commits

- **Granular and frequent.** One logical change = one commit.
- **No "WIP" commits, no batched-up commits.** If you're about to commit two unrelated things, split them.
- **Co-authorship is mandatory** on every commit:
  ```
  Co-Authored-By: Mark <psyhik17@gmail.com>
  Co-Authored-By: Claude <noreply@anthropic.com>
  ```

### Quality bar

- If there's any sense that "doing it the harder way will be harder now but better long-term" — do it the better way. Even if it takes more time.
- No rushed or underdeveloped solutions. No spaghetti.
- Yokai is a foundation library; downstream consumers rely on its stability.

## How the renderer works

```
React component tree
  → Reconciler (React 19 host config)        reconciler.ts
  → DOM mutation + Yoga layout calc          dom.ts / yoga-layout/index.ts
  → Tree traversal + text wrapping           render-node-to-output.ts
  → Screen buffer (cell grid)                screen.ts / output.ts
  → Frame diff → ANSI patches                log-update.ts / frame.ts
  → stdout
```

Frames are double-buffered. Diffing is cell-by-cell. The renderer emits the minimal ANSI patch sequence each tick — a spinner update or a streamed line touches O(changed cells), not O(rows × cols).

## Key files

| File | What it does |
|------|--------------|
| `packages/renderer/src/ink.tsx` | Main `Ink` class, frame lifecycle, alt-screen, signal handling, selection coordination |
| `packages/renderer/src/reconciler.ts` | React 19 host config — createInstance, commitUpdate, removeChild, focus |
| `packages/renderer/src/render-node-to-output.ts` | DFS traversal, text wrapping, ScrollBox drain, viewport culling |
| `packages/renderer/src/screen.ts` | Cell grid, char/style/hyperlink pools |
| `packages/renderer/src/log-update.ts` | Frame diffing, ANSI patch generation, DECSTBM scroll hints |
| `packages/renderer/src/selection.ts` | Text selection state machine (anchor/focus/virtualRow tracking) |
| `packages/renderer/src/focus.ts` | Tab-order focus manager, focus stack |
| `packages/renderer/src/components/ScrollBox.tsx` | Imperative scroll API, sticky scroll, clamp bounds |
| `packages/renderer/src/components/AlternateScreen.tsx` | Alt-screen enter/exit with mouse tracking |
| `packages/renderer/src/components/Draggable.tsx` | Drag primitive: gesture capture, raise-on-press, drag-time z boost, bounds clamp |
| `packages/renderer/src/components/DropTarget.tsx` | Drop receiver: accept filter, hover lifecycle, topmost-wins drop dispatch |
| `packages/renderer/src/components/Resizable.tsx` | Resize primitive with `s` / `e` / `se` handles |
| `packages/renderer/src/components/FocusGroup.tsx` | Arrow-key navigation between focusable descendants |
| `packages/renderer/src/components/FocusRing.tsx` | Focusable Box with focus-visible border indicator |
| `packages/renderer/src/components/FocusContext.ts` | React context exposing FocusManager + root to hooks |
| `packages/renderer/src/hooks/use-focus.ts` | Per-element focus tracking + imperative focus |
| `packages/renderer/src/hooks/use-focus-manager.ts` | Global focus actions (focused, focus, focusNext/Previous, blur) |
| `packages/renderer/src/focus.ts` | FocusManager — activeElement, focus stack, Tab cycling, subscribe APIs |
| `packages/renderer/src/drag-registry.ts` | Module-scope coordination between Draggable and DropTarget |
| `packages/renderer/src/hit-test.ts` | Hit-test for click / mouse-down dispatch (z-order + escape-bounds traversal) |
| `packages/shared/src/yoga-layout/index.ts` | Pure-TS flexbox engine |

## Development

```bash
pnpm install
pnpm build       # shared → renderer
pnpm typecheck
pnpm lint
pnpm test
```

CI runs typecheck + lint + build + test on every push and PR to `main` (`.github/workflows/ci.yml`).

## Things to know before changing things

- **Selection state is owned by Ink, not React.** It survives re-renders and is mutated directly by event handlers.
- **ScrollBox's `scrollTo`/`scrollBy` mutate the DOM in place.** Not React state. Surprising, but intentional — required for race-free scroll under streaming content.
- **Yoga node lifecycle:** `clearYogaNodeReferences` nulls all refs in a subtree *before* `freeRecursive()`. The root unmount path uses `.free()` not `.freeRecursive()` to avoid double-freeing children. Don't mess with this without understanding why.
- **Alt-screen cleanup is unconditional on signal-exit.** `EXIT_ALT_SCREEN` and `DISABLE_MOUSE_TRACKING` are sent every time because the `altScreenActive` flag can be stale. `?1049l` is a no-op when already on the main screen, so this is safe.
- **`virtualAnchorRow` / `virtualFocusRow`** track pre-clamp positions during selection drag-to-scroll. Both are required for the drag→follow transition to be correct. If you touch selection code, read `selection.ts` end-to-end first.
- **`onMouseDown` + gesture capture for drag interactions.** Box exposes `onMouseDown(e)` alongside `onClick`. Inside the handler, calling `e.captureGesture({ onMove, onUp })` claims all subsequent mouse-motion events and the eventual release for that one drag — selection extension is suppressed for the duration, and the captured handlers fire even when the cursor leaves the originally-pressed element's bounds. The active gesture lives on `App.activeGesture`; it's drained on FOCUS_OUT and on lost-release recovery so a drag aborted by leaving the terminal window can't leave a dangling handler. `onClick` and selection still work normally when no gesture is captured. Read `events/mouse-event.test.ts` for the dispatch and capture semantics, and the comments around `App.handleMouseEvent` for how the routing decisions interact with selection state.
- **`zIndex` only applies to `position: 'absolute'`.** The `Styles.zIndex` property is silently ignored on in-flow / relative nodes (they don't overlap, so paint order has no meaning). A dev-mode warning fires from `setStyle` when set on a non-absolute node. Stacking is **flat per parent's render group**, not CSS-stacking-context-global: a nested z-indexed absolute sorts among its siblings inside its parent, not against arbitrarily distant cousins. This emerges naturally from `renderChildren` recursing per parent — each call sorts only that parent's direct children. Equal effective-z preserves DOM order via stable sort, so the no-zIndex case stays bit-for-bit identical to pre-feature behavior. Negative zIndex paints under in-flow content (the backdrop pattern). Read `render-node-to-output.test.ts` for the exact paint-order semantics across overlap, nesting, and equal-z cases.
- **Dirty-absolute rects are collected tree-wide once per frame.** The "force re-render clean siblings overlapping a moving absolute" guard in `renderChildren` reads from a module-scope list (`globalDirtyAbsoluteRects`) populated by a single walk at the `ink-root` entry of each render. Tree-wide because `absoluteClears` (output.ts pass 1) is global — a moving absolute's clear can suppress blits at any level, including non-sibling subtrees. The earlier per-renderChildren pre-scan only saw direct dirty-absolute children and missed cross-subtree contamination (the constrained-drag notch bug). Don't revert this without re-introducing the regression test in `render-node-to-output.test.ts > clean cousin of a moving absolute is repainted`.
- **Hit-test honors zIndex AND traverses outside parent bounds for absolute children.** `hit-test.ts` mirrors `renderChildren`'s paint-order sort so the topmost painted box is also the one that receives the click. When a parent's rect doesn't contain the cursor, recursion still descends into ABSOLUTE children — they own their own coordinate space and may have been positioned outside the ancestor (raise-on-press + drag often takes them there). Without the escape-bounds traversal, dragging an absolute outside its container makes it unclickable.
- **Gesture capture is the substrate for drag/drop/resize.** `<Draggable>`, `<DropTarget>`, and `<Resizable>` all build on `event.captureGesture({ onMove, onUp })` — there's no parallel "drag" or "resize" event system. The pure-helper / handler-press extraction pattern (`handleDragPress(e, deps)`, `handleResizePress(e, dir, deps)`) keeps the gesture lifecycle testable without React. New components in this family should follow the same shape so tests don't have to spin up Ink. The drag/drop coordination state lives in `drag-registry.ts`, not in any component.
- **Resizable currently CLIPS overflow** (`overflow: 'hidden'` default on the wrapper Box). True "box can't shrink past content" autoFit was attempted twice and reverted both times — measurement timing is the blocker (yoga's `getComputedHeight` is read BEFORE ink calls `calculateLayout`, so values are stale by one frame, and the auto-grow effect ended up fighting the user's south-handle drag). The right fix needs a measurement strategy that runs AFTER calculateLayout — most likely a post-render hook fed by ink's `onFrame`. Tracked as a future enhancement; keep the `overflow: 'hidden'` default until then.
- **Focus subscriptions on FocusManager.** Two surfaces: `subscribeToFocus(node, listener)` fires only on the named node's transitions (used by `useFocus` so each consumer re-renders only when its own element changes), and `subscribe(listener)` fires after every focus change (used by `useFocusManager` to keep its `focused` value reactive). Both iterate snapshots of the listener set so a listener that unsubscribes during dispatch doesn't perturb others. `handleNodeRemoved` drops the per-node listener bucket on cleanup so a stale listener can't keep a freed yoga subtree alive.
- **FocusContext is the React-side bridge to FocusManager.** Lives on `App` and exposes `{ manager, root }`. Hooks (`useFocus`, `useFocusManager`) and `<FocusGroup>` consume it via `useContext`. Components rendered OUTSIDE App (e.g. unit tests that mount a tree without going through Ink's render) get null and degrade to no-op imperatives + stable shapes — explicit null checks at every callsite, no throws.
- **`<FocusGroup>` does NOT implement roving tabindex** in v1. Tab cycles through every `tabIndex >= 0` in the entire tree (the existing FocusManager.focusNext walker); FocusGroup adds arrow-key navigation on top. That keeps Tab predictable for consumers who don't want to be Tab-bounded; consumers who DO want pure roving-tabindex behavior can set `tabIndex={-1}` on inner items and only tabIndex={0} on the group's entry point. Roving-tabindex as an opt-in mode is a sound v2 if a real consumer asks.
