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
