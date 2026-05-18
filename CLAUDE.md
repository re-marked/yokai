# CLAUDE.md

Guidance for Claude Code (or any AI assistant) working in this repository.

## What this repo is

`yokai` — a React terminal renderer used by [claude-corp](https://github.com/re-marked/claude-corp). Pure-TypeScript Yoga flexbox, diff-based screen output, ScrollBox with viewport culling and hardware scroll hints. Forked from [claude-code-kit](https://github.com/minnzen/claude-code-kit), itself a fork of [Ink](https://github.com/vadimdemedes/ink).

Two packages in a pnpm monorepo:
- `@yokai-tui/renderer` — React reconciler, components, event system, terminal I/O
- `@yokai-tui/shared` — pure-TS Yoga port, logging, env helpers

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
| `packages/renderer/src/components/Surface/` | Foundational rectangle primitive — paint / layer / clip / hit-test / elevation / backdrop. `Surface.tsx` is the React shell; `layer.ts` resolves named bands to zIndex; `shadow.ts` is the pure cell math for elevation. Draggable / Resizable / Window all paint through Surface. |
| `packages/renderer/src/components/Window/` | Top-level desktop primitive (A4 + A18). `Window.tsx` is the React shell that composes Surface + `handleDragPress` (titlebar) + `handleResizePress` (handles) into ONE rect lifecycle. `window-manager.ts` is the module-scope focus stack (modal-barrier rule, raise-on-press, subscribers). `context.ts` carries `WindowFocusContext` + `CursorOverWindowContext` consumed by `useInput` for focus-/hover-scoped auto-routing. `types.ts` is the prop surface and value-type definitions. |
| `packages/renderer/src/components/TextInput/` | Editable text input — pure state machine + caret math + React shell |
| `packages/renderer/src/events/paste-event.ts` | PasteEvent class for the smart-bracketed-paste pipeline |
| `packages/renderer/src/components/PasteContext.ts` | Lets AlternateScreen configure App's paste threshold |
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
- **Press intent classifies every left-press up front.** `dispatchMouseDown` reports `{ gesture, clickable }`; `computePressIntent` reduces that plus the modifier state to one of `gesture-confirmed | gesture-tentative | click | select`. The `click` intent (no capture, hit chain has `onClick`, no force-select modifier) skips `startSelection` AND skips multi-click escalation, then fires `onClickAt` on release via `App.pressIntentClick`. Without this, accidental motion between press and release on a clickable Box would escalate the press into a selection drag and eat the click (B8 — issue #61). Force-select modifier (`Shift` or `Alt` — SGR bits 0x04 / 0x08) demotes `click` → `select` so consumers can still highlight text inside a clickable region (Button label, link anchor text). Confirmed gestures and tentative gestures take precedence over both — `captureGesture` always wins the press regardless of `clickable`. The flag is drained on FOCUS_OUT, on no-button-motion lost-release, and at the next fresh press, mirroring how `activeGesture` is drained. Read `press-intent.ts` (truth table) and `App.press-intent.test.ts` (end-to-end behaviors) before changing the routing.
- **`measureTextNode` returns NATURAL dimensions in `Undefined` mode** — never wraps, never truncates, never appends an ellipsis. Yoga calls measureFunc with `widthMode=Undefined` (and `width=NaN`) during the basis pass when no width constraint is known yet (e.g. column parents auto-sizing to content). Pre-fix, the function ran `wrapText(text, NaN, …)`, which for `truncate` modes appended an ellipsis to natural text (`width=natural+1`) and for `truncate-start` collapsed the whole string to a single `"…"` cell. That poisoned the flex basis with a width derived from imaginary fitting, cascading into silent truncation downstream (shakedown A1 / A5 — issues #51 / #58). Wrap and truncate only make sense when there's an actual constraint — `AtMost` or `Exactly` — and that's when measureFunc applies them. Read `dom.test.ts > measureTextNode` for the full invariant matrix before touching the early-return logic.
- **Percent dimensions on in-flow children resolve against the parent's CONTENT box** (outer − border − padding) in the yoga port — `width="100%"` on a child of a `border={1}` parent gives the child a width of `parentWidth - 2`, not `parentWidth`. Matches CSS containing-block rules. Pre-fix the port resolved against parent outer, which made `<Box width="100%">` overpaint the right border of any bordered parent (shakedown B7 — issue #60). Deviation from Yoga upstream: child percent `margin`/`padding`/`border` also resolve against parent content box here (upstream resolves against `ownerWidth` = parent outer). Intentional — the "% on child = fraction of available space" model is consistent and matches the TUI mental model. Absolute children are unaffected; they resolve against the parent's padding-box per CSS §10.1 (`layoutAbsoluteChild`, untouched). Per-edge position values (`top` / `right` / `bottom` / `left`) all resolve against `ownerWidth` per the existing Yoga upstream convention — not against `ownerHeight` for the vertical edges. Read `yoga-layout/index.test.ts` for the full coverage matrix before touching `ownerW`/`ownerH` in `layoutNode`.
- **`zIndex` only applies to `position: 'absolute'`.** The `Styles.zIndex` property is silently ignored on in-flow / relative nodes (they don't overlap, so paint order has no meaning). A dev-mode warning fires from `setStyle` when set on a non-absolute node. Stacking is **flat per parent's render group**, not CSS-stacking-context-global: a nested z-indexed absolute sorts among its siblings inside its parent, not against arbitrarily distant cousins. This emerges naturally from `renderChildren` recursing per parent — each call sorts only that parent's direct children. Equal effective-z preserves DOM order via stable sort, so the no-zIndex case stays bit-for-bit identical to pre-feature behavior. Negative zIndex paints under in-flow content (the backdrop pattern). Read `render-node-to-output.test.ts` for the exact paint-order semantics across overlap, nesting, and equal-z cases.
- **Dirty-absolute rects are collected tree-wide once per frame.** The "force re-render clean siblings overlapping a moving absolute" guard in `renderChildren` reads from a module-scope list (`globalDirtyAbsoluteRects`) populated by a single walk at the `ink-root` entry of each render. Tree-wide because `absoluteClears` (output.ts pass 1) is global — a moving absolute's clear can suppress blits at any level, including non-sibling subtrees. The earlier per-renderChildren pre-scan only saw direct dirty-absolute children and missed cross-subtree contamination (the constrained-drag notch bug). Don't revert this without re-introducing the regression test in `render-node-to-output.test.ts > clean cousin of a moving absolute is repainted`.
- **Hit-test honors zIndex AND traverses outside parent bounds for absolute children.** `hit-test.ts` mirrors `renderChildren`'s paint-order sort so the topmost painted box is also the one that receives the click. When a parent's rect doesn't contain the cursor, recursion still descends into ABSOLUTE children — they own their own coordinate space and may have been positioned outside the ancestor (raise-on-press + drag often takes them there). Without the escape-bounds traversal, dragging an absolute outside its container makes it unclickable.
- **Gesture capture is the substrate for drag/drop/resize.** `<Draggable>`, `<DropTarget>`, and `<Resizable>` all build on `event.captureGesture({ onMove, onUp })` — there's no parallel "drag" or "resize" event system. The pure-helper / handler-press extraction pattern (`handleDragPress(e, deps)`, `handleResizePress(e, dir, deps)`) keeps the gesture lifecycle testable without React. New components in this family should follow the same shape so tests don't have to spin up Ink. The drag/drop coordination state lives in `drag-registry.ts`, not in any component.
- **`<Surface>` is the paint substrate for every desktop primitive.** `<Draggable>` and `<Resizable>` paint through Surface; the upcoming `<Window>` (A4) composes Surface + Draggable + Resizable + title chrome. A renderer-side change to Surface (host attributes `surfaceHitTestBoundary` / `surfaceElevation` consumed by `hit-test.ts` / `render-node-to-output.ts`, layer→zIndex via React-side `resolveZIndex`) affects all consumers transitively. Default Surface is byte-identical to `<Box>` — `layer='base'` resolves to no zIndex, no surface* attributes, no extra siblings. The named layer bands (base/docked/overlay/dropdown/modal/popover/tooltip/drag-ghost, gaps of 100/1000) are the load-bearing vocabulary: a tooltip painting under a modal would be a layer-resolution bug. `hitTestBoundary` is forward-looking (current reverse-z iteration already provides implicit boundary semantics) but codifies intent for a future hit-test refactor; tests pin the contract. `elevation` paint pass runs at the top of the ink-box branch — be careful about the known stale-shadow-under-clean-blit limitation documented in `render-node-to-output.ts`. Read `components/Surface/types.ts` (prop shape), `layer.ts` (band table + resolver), `shadow.ts` (cell math), and the hit-test / render-node-to-output tests with `A23` in their describe block before changing any of it.
- **Resizable currently CLIPS overflow** (`overflow: 'hidden'` default on the wrapper Box). True "box can't shrink past content" autoFit was attempted twice and reverted both times — measurement timing is the blocker (yoga's `getComputedHeight` is read BEFORE ink calls `calculateLayout`, so values are stale by one frame, and the auto-grow effect ended up fighting the user's south-handle drag). The right fix needs a measurement strategy that runs AFTER calculateLayout — most likely a post-render hook fed by ink's `onFrame`. Tracked as a future enhancement; keep the `overflow: 'hidden'` default until then.
- **Focus subscriptions on FocusManager.** Two surfaces: `subscribeToFocus(node, listener)` fires only on the named node's transitions (used by `useFocus` so each consumer re-renders only when its own element changes), and `subscribe(listener)` fires after every focus change (used by `useFocusManager` to keep its `focused` value reactive). Both iterate snapshots of the listener set so a listener that unsubscribes during dispatch doesn't perturb others. `handleNodeRemoved` drops the per-node listener bucket on cleanup so a stale listener can't keep a freed yoga subtree alive.
- **FocusContext is the React-side bridge to FocusManager.** Lives on `App` and exposes `{ manager, root }`. Hooks (`useFocus`, `useFocusManager`) and `<FocusGroup>` consume it via `useContext`. Components rendered OUTSIDE App (e.g. unit tests that mount a tree without going through Ink's render) get null and degrade to no-op imperatives + stable shapes — explicit null checks at every callsite, no throws.
- **`<FocusGroup>` does NOT implement roving tabindex** in v1. Tab cycles through every `tabIndex >= 0` in the entire tree (the existing FocusManager.focusNext walker); FocusGroup adds arrow-key navigation on top. That keeps Tab predictable for consumers who don't want to be Tab-bounded; consumers who DO want pure roving-tabindex behavior can set `tabIndex={-1}` on inner items and only tabIndex={0} on the group's entry point. Roving-tabindex as an opt-in mode is a sound v2 if a real consumer asks.
- **FocusGroup uses `onKeyDown` (not `useInput`).** Switched after TextInput shipped — useInput fires regardless of target, but TextInput needs to consume arrow keys for caret movement. With onKeyDown on the group's container Box, KeyboardEvent bubbles from the focused descendant; if the descendant called `preventDefault()` (TextInput does), FocusGroup sees `defaultPrevented` and skips. Don't revert this without re-introducing the conflict.
- **Smart bracketed paste split.** `App.handleParsedInput` splits pastes by length: ≤ threshold dispatched as per-character keypresses (so short pastes feel like typing and useInput sees a normal stream), > threshold fired once as a `PasteEvent` through the DOM AND once via useInput as the full string with `key.isPasted=true`. Threshold default is 32, configurable via `<AlternateScreen pasteThreshold>` which writes to `App.pasteThreshold` via `PasteContext`. The threshold lives on the App instance (mutable field) because the split runs outside React — read at parse time against the latest value, no React rerender of the input loop.
- **TextInput is a state-machine + React shell.** The pure reducer in `components/TextInput/state.ts` owns every editing operation (insertText, deleteBackward/Forward/WordBackward/LineBackward/LineForward, moveCaret with extend, setCaret, selectAll, undo, redo). The React component translates keystrokes into Action objects via the pure `keyToAction` mapper. Undo grouping merges consecutive same-kind insert/delete entries; paste always gets its own entry (so Ctrl+Z reverts a paste atomically). Caret rendering uses `useDeclaredCursor` so the real terminal cursor follows — no synthetic glyph (matters for IME and screen readers).
- **`<Window>` is one rect, two gestures, two routing scopes (A4 + A18).** The Window component owns a single `{top, left, width, height}` state. The titlebar's onMouseDown calls `handleDragPress` (mutates `{top,left}` via setDragPos); the resize handles' onMouseDown calls `handleResizePress` (mutates `{width,height}` via setResizeSize). BOTH setters thread through the SAME setRect — the A4 fix. Reusing the extracted pure handlers (not nesting `<Draggable>` inside `<Resizable>`) is what keeps the yoga absolute-rect cache coherent across both gestures. Paint z lives in a Window-local module-scope counter (`takeNextWindowZ`) — separate from Draggable's `takeNextZ` so window stacking and raw-Draggable stacking don't interleave. Modal windows compute `paintZ = MODAL_Z_BAND_BASE (3000) + persistedZ` so they always paint above non-modals under realistic press counts. The backdrop scrim is a sibling Surface at `paintZ - 1` with `hitTestBoundary` to absorb clicks at every cell. Read `Window/Window.tsx` end-to-end before touching the rect or z math — the comments document the load-bearing invariants (claimsFocus gating, ref-vs-state ordering, transition-fire-on-flip-only).
- **`WindowManager` is the focus stack singleton, NOT React state.** Window's `register/unregister` from a `useEffect` updates the module-scope stack; `claimWindowFocus(id)` bumps a focus z counter and fires per-window subscribers. The **modal-barrier rule** in `getFocusedWindowId` returns the topmost modal first — non-modals beneath a modal can have their focus z bumped (so they're "next in line" once the modal closes) but cannot actually become focused while a modal exists. `subscribeWindow(id, listener)` fires only on THIS window's focus flips (sibling promotions that don't change this window's state don't wake the listener), so each Window component re-renders only on its own focus changes. Modal and claimsFocus are mount-time-only captures inside the manager — toggling them post-mount has no effect, documented in `Window/types.ts`.
- **`useInput` auto-routes inside `<Window>` (A18).** Reads `WindowFocusContext` and `CursorOverWindowContext` from `Window/context.ts`. Per-event-type split: keyboard fires when the enclosing Window is **focused** (via `WindowFocusContext.isFocused`); wheel fires when the cursor is **over** the enclosing Window (via `CursorOverWindowContext.isOver`). Outside any Window, both contexts are null and the handler fires unconditionally (back-compat — pre-Window consumers see no change). Explicit `isActive` always wins over the auto-routing. `setRawMode` is gated by `focus OR cursor-over` so raw mode stays on whenever any event might fire. The `CursorOverWindowContext` value is provided per-Window from the outer Surface's mouseEnter/Leave, not from a global App-level cursor tracker — captured gestures suppress Enter/Leave during the gesture, so the value can be stale mid-drag (harmless: drag follows cursor, so cursor stays "over" the dragged window naturally).
- **`<Window onInput>` is the primary per-window subscription.** React context flows DOWN, so a `useInput` call placed in the same component that renders `<Window>` sits ABOVE the Window's context providers and falls back to "always fire" (silently — every window's handler fires on every keystroke). The `onInput` prop sidesteps this trap: Window renders an internal `<WindowInputBridge>` as a child of its own providers, calls `useInput` from inside the bridge, and forwards events to `onInput` via a ref-stashed wrapper. Consumers writing per-window state + handler in one component should use `onInput`. The descendant-component pattern (extract a child, call `useInput` inside it) is the alternative for multi-handler / conditional cases. Read `Window.tsx > WindowInputBridge` and the `onInput` JSDoc in `Window/types.ts`.
- **`<Window>` defaults `backgroundColor='black'`.** Pre-fix the default was undefined (transparent), which let lower-z window content bleed through windows on top — the desktop convention is solid windows. Override with `backgroundColor={undefined}` to opt back into transparency for a panel that should show terminal bg through it.
- **Resize handles offset for the titlebar.** The E (east) handle starts at `top=TITLEBAR_HEIGHT` (not 0) so it doesn't paint over the titlebar's rightmost cell — without that offset, a Window's title at the right edge of the bar would have its last character covered by the gray handle. The S handle is naturally below the titlebar; SE handle is at the bottom-right cell. Constant `TITLEBAR_HEIGHT` in `Window.tsx` keeps this in sync with the titlebar Box's `height={1}` pin.
