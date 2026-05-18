# Changelog

## Unreleased

**Added**

- **`<Window>`** — top-level desktop primitive (A4 + A18, closes #56 / #75). Single rect state (`{top, left, width, height}`) mutated by both drag and resize through the same setter — fixes the long-standing rect-cache desync when nesting `<Draggable>` inside `<Resizable>`. Composes `<Surface>` for paint, `handleDragPress` (the same pure helper `<Draggable>` exports) for titlebar drag, and `handleResizePress` (from `<Resizable>`) for edge/corner handles. Built-in titlebar + close button chrome, focused/blurred border-color flip, raise-on-press paint z (isolated counter, doesn't interleave with Draggable stacking), drag-time z boost, modal mode with backdrop scrim in Surface's `modal` z-band, and **focus-/hover-scoped event routing** for everything inside (A18) — keyboard fires when the enclosing window is focused, wheel fires when the cursor is over the enclosing window. New module: `components/Window/` (`Window.tsx`, `window-manager.ts`, `context.ts`, `types.ts`). New demo: `pnpm demo:window`. Supersedes the interim `docs/patterns/window.md` Draggable-as-window pattern for new code.
- **`useInput` auto-routes inside `<Window>`** — consumer code drops the `if (myWindowId !== activeWindowId) return` boilerplate. Reads `WindowFocusContext` and `CursorOverWindowContext`; per-event-type split (focus-scoped keyboard, hover-scoped wheel) so the wheel still scrolls "whatever you're hovering" the way real OSes do. Outside any Window, behavior is unchanged (back-compat). Explicit `isActive` still wins over the auto-routing.
- **`<Surface>`** — foundational rectangle primitive that paints, layers, optionally bounds hit-tests, casts drop shadows (elevation 0-5), and auto-renders a backdrop scrim. Named z-bands via `layer` prop: `base / docked / overlay / dropdown / modal / popover / tooltip / drag-ghost`, with explicit numeric `zIndex` as an escape hatch. Default Surface is byte-identical to `<Box>` — opt into each Surface feature individually. Foundation for `<Window>` (A4) and the Phase 2 modal / popover / tooltip components.
- New ink-box host attributes `surfaceHitTestBoundary` and `surfaceElevation` consumed by `hit-test.ts` and `render-node-to-output.ts`. Dev warnings (`logForDebugging` — no-op without `DEBUG=1`) fire when `hitTestBoundary` / `elevation` / `backdrop` are set on a non-absolute Surface.

**Changed**

- `<Draggable>` and `<Resizable>` now paint through `<Surface>` internally. No public API change; existing consumers see identical behavior. Surface's `clip="hidden"` carries Resizable's prior `overflow:'hidden'` default; Draggable's raise-on-press z math flows through Surface's explicit `zIndex` prop.

**Fixed**

- `<ScrollBox>` now defaults to vertical content layout (`flexDirection: 'column'`) so ordinary lists/logs scroll without an explicit workaround.
- `<ScrollBox>` `scrollTo` / `scrollBy` clamp to content bounds, preventing overscroll into blank space.
- `<ScrollBox>` now auto-scrolls on mouse wheel when the cursor is over the box, with `wheelStep` and `disableWheel` props for tuning/opt-out.
- `MouseDownEvent.captureGesture(...)` is now leaf-first: once a descendant captures a press, ancestors cannot overwrite that gesture.

Tagged releases of `@yokai-tui/renderer` and `@yokai-tui/shared`. The full commit graph is preserved on `main` — `git log vPREV..vNEXT` shows everything between any two tags.

## v0.6.0 — 2026-04-27

`<TextInput>` and smart bracketed paste — closes the largest missing primitive in yokai. [GitHub release](https://github.com/re-marked/yokai/releases/tag/v0.6.0).

**Added**

- **`<TextInput>`** — editable text. Single-line and multiline modes; controlled and uncontrolled value; placeholder, password, maxLength, disabled, autoFocus, selectionColor, historyCap props. Caret positioned via `useDeclaredCursor` (real terminal cursor — IME / a11y correct). Editing keybindings: type / Backspace / Delete / arrows / Home/End / Ctrl+arrows (word nav) / Ctrl+W / Ctrl+U / Ctrl+K / Ctrl+A / Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z. Selection via Shift+arrows or mouse drag. `onSubmit` (Enter / Ctrl+Enter), `onCancel` (Escape).
- **`PasteEvent`** — bubbling, cancelable terminal event upgraded from a stub `Event` subclass to full `TerminalEvent` shape. `onPaste` / `onPasteCapture` props on `<Box>`.
- **Smart bracketed-paste split** — `App.handleParsedInput` splits pastes by length: ≤ threshold dispatches per-character keypresses (short pastes feel like typing); > threshold fires once as `PasteEvent` plus once via `useInput` (backwards compat).
- **`<AlternateScreen pasteThreshold>`** — configurable threshold, default 32 characters.
- **`scrollToKeepCaretVisible` + `sliceRowByCells`** — pure scroll helpers used by TextInput's horizontal/vertical scroll.

**Changed**

- `<FocusGroup>` switched from `useInput` to `onKeyDown` so a focused descendant (e.g. `<TextInput>`) can `preventDefault()` arrow keys to consume them for caret movement instead of focus navigation.
- `<TextInput>` (within v0.6.0): horizontal scroll for single-line content longer than the box width; vertical scroll for multiline content taller than the box height. Caret stays visible after every edit.

**Internal**

- New module structure under `packages/renderer/src/components/TextInput/` — pure state machine (`state.ts`), pure caret math (`caret-math.ts`), pure scroll math (`scroll-math.ts`), thin React shell (`TextInput.tsx`).
- `PasteContext` lets `<AlternateScreen>` push the paste threshold into App's instance field outside React's render flow.

## v0.5.1 — 2026-04-27

Documentation. No code changes.

**Added**

- `docs/` build-out: 78 pages covering install, concepts, components, hooks, patterns, guides, internals, reference, plus `AGENTS.md`, `troubleshooting.md`, `faq.md`, this changelog.
- README gains a Keyboard navigation section with `<FocusGroup>` + `<FocusRing>` example and pointers at `useFocus` / `useFocusManager`.
- Main README links to `docs/` for full reference.

## v0.5.0 — 2026-04-27

Keyboard focus and arrow navigation. [GitHub release](https://github.com/re-marked/yokai/releases/tag/v0.5.0).

**Added**

- `useFocus(options?)` hook — per-element focus tracking. Returns `{ ref, isFocused, focus }`.
- `useFocusManager()` hook — global focus actions: `focused`, `focus`, `focusNext`, `focusPrevious`, `blur`.
- `<FocusGroup direction wrap isActive>` — arrow-key navigation across descendants. `direction` is `'row' | 'column' | 'both'`.
- `<FocusRing borderColorFocus borderColorIdle autoFocus>` — focusable Box with built-in focus chrome.
- `FocusManager.subscribe(...)` plumbing on `FocusContext` so external integrations can observe focus changes.
- Type exports: `UseFocusOptions`, `UseFocusResult`, `UseFocusManagerResult`, `FocusGroupProps`, `FocusGroupDirection`, `FocusRingProps`.

**Changed**

- Focus state plumbing extended through context to support subscribe API; existing single-element focus behavior preserved.

**Internal**

- Biome formatting pass on focus-feature files.

## v0.4.0 — 2026-04-27

Drag, drop, resize, z-index, and the notch fix. [GitHub release](https://github.com/re-marked/yokai/releases/tag/v0.4.0).

**Added**

- `<Draggable initialPos bounds disabled onDragStart onDrag onDragEnd>` — first-class drag primitive.
- `<DropTarget accept onDragEnter onDragOver onDragLeave onDrop>` — receiver side, wired through a coordination layer (`drag-registry.ts`).
- `<Resizable initialSize minSize maxSize handles>` — resize primitive with `'s'`, `'e'`, `'se'` handles. Clips overflow; auto-fits min height to content.
- Gesture capture API: `MouseDownEvent.captureGesture({ onMove, onUp })`. Claims subsequent motion + the eventual release for the lifetime of one drag, suppresses selection extension, and routes events to the captured handlers even when the cursor leaves the originally pressed element. Mirrors web `setPointerCapture`.
- `onMouseDown` prop on `<Box>` and the `ink-box` JSX intrinsic.
- `dispatchMouseDown` hit-test path with gesture-capture return value.
- `Styles.zIndex` for `position: 'absolute'` nodes. Per-parent stacking; negative values paint under in-flow content. Dev-mode warning fires when set on a non-absolute node.
- Public exports of mouse event types: `MouseDownEvent`, `MouseMoveEvent`, `MouseUpEvent`, `GestureHandlers`.
- Type exports: `DraggableProps`, `DragPos`, `DragBounds`, `DragInfo`, `DropTargetProps`, `DropInfo`, `ResizableProps`, `ResizeSize`, `ResizeHandleDirection`, `ResizeInfo`.

**Fixed**

- Hit-test honors `zIndex` and follows escape-bounds absolutes — clicks on a positioned overlay no longer fall through to in-flow content underneath.
- Tree-wide collection of dirty absolute rects for overlap-rerender. Cross-subtree absolute overlap (the "notch" repro) now repaints correctly when a moving absolute crosses a clean sibling absolute in another subtree.
- In-flow children that overlap a moving absolute now force-rerender (no stale paint behind a moved overlay).
- Per-cell suppression of blits over absolute clears — moving an absolute no longer leaves a trail of stale cells from the previous frame.
- Text-node guard uses the `DOMNode` union instead of an asserted `DOMElement`, eliminating a class of incorrect type narrowing in render traversal.

**Internal**

- `drag-registry.ts` — coordination layer between `<Draggable>` and `<DropTarget>`.
- Vitest config now includes `.tsx` test files.
- Biome format drive-by on `render-node-to-output`.

## Pre-v0.4.0

Initial yokai fork from claude-code-kit, plus the work that landed before tagging began. The full history is on `main`; consult [GitHub releases](https://github.com/re-marked/yokai/releases) and `git log v0.4.0` for the rollup of everything that shipped in the first tagged version.
