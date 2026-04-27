# AGENTS.md

Guide for AI agents writing code that uses yokai. Read this before generating yokai consumer code.

## Where to look first

- [`concepts/`](concepts/) — mental model. Read [Layout](concepts/layout.md), [Events](concepts/events.md), and [Focus](concepts/focus.md) before writing non-trivial code.
- [`components/`](components/) — API reference per component. Each page lists props, behavior, and a minimal example.
- [`hooks/`](hooks/) — API reference per hook.
- [`patterns/`](patterns/) — working code for recurring shapes (keyboard menu, modal, sortable list, kanban, resizable panes, autocomplete). Copy from these.
- [`troubleshooting.md`](troubleshooting.md) — runtime failures and fixes.

## Prefer the high-level component over the primitive

| Use this | Instead of this |
|----------|-----------------|
| `<Draggable>` | Raw `event.captureGesture` for drag |
| `<DropTarget>` | Manual mouse-up coordinate checks |
| `<Resizable>` | Hand-built handles + `captureGesture` |
| `<FocusGroup>` + `<FocusRing>` | Manual `useFocus` + arrow-key dispatch in `useInput` |
| `<TextInput>` | Hand-rolled buffer + `useInput` editing loop |
| `<AlternateScreen mouseTracking pasteThreshold={n}>` | Manually writing `\x1b[?1049h`, `\x1b[?1000h`, `\x1b[?2004h`, parsing `200~`/`201~` for paste |
| `<ScrollBox stickyScroll>` | Manual scroll-offset tracking + viewport math |
| `<Link>` | Hand-rolled OSC 8 escape sequences |
| `useTerminalViewport()` | Reading `process.stdout.columns` directly |
| `useApp().exit()` | `process.exit()` |

The high-level component handles edge cases (lost-release recovery, gesture cancellation on FOCUS_OUT, drag-time z-boost, focus-visible chrome) that hand-rolled equivalents miss.

## Common mistakes

- **Setting `tabIndex` on a non-Box element.** Only `<Box>` accepts `tabIndex`. `<Text tabIndex={0}>` is silently ignored. Wrap text in a Box.
- **Forgetting `<AlternateScreen mouseTracking>`.** Mouse events do not fire without it. The alt-screen and mouse-tracking modes are separate; `mouseTracking` is the prop that enables `?1000h`.
- **Using `useEffect` to measure layout.** `getComputedHeight` is stale before yokai's `calculateLayout` runs. Measure with `useLayoutEffect` only after a yokai commit, or rely on a component's `onResize`-style callback. The Resizable autoFit work fixed this once; don't re-introduce it.
- **Mutating state inside `useInput` without `isActive`.** A `useInput` handler in an unmounted-but-still-referenced component fires for input it shouldn't see. Pass `{ isActive: someCondition }` to scope it.
- **`position: 'absolute'` without `top` / `left`.** Yoga places the node at `0,0`. Set explicit coordinates.
- **`zIndex` on non-absolute elements.** Silently ignored. `zIndex` only affects `position: 'absolute'` siblings within one parent's render group.
- **Many `tabIndex={0}` elements without `<FocusGroup>`.** Tab cycles through them globally, but arrow keys do nothing. Wrap the list in `<FocusGroup direction="column">`.
- **Calling `setSize` from inside `<Resizable>`'s `onResize`.** Resizable owns its size state. External `setSize` during a resize gesture creates a feedback cycle. Read `onResize` to mirror state, never to dictate it.
- **Missing `key` on mapped `<Draggable>`s.** React reuses instances and drag state leaks between rows. Use a stable id, not the array index, for lists that reorder.
- **`onClick` on `<Draggable>`.** Gesture capture suppresses click dispatch for the drag's duration. Distinguish click from drag in `onDragEnd` (zero displacement) instead.
- **Scrolling `<ScrollBox>` via React state.** ScrollBox's `scrollTo` / `scrollBy` mutate the DOM in place by design. Use the imperative ref, not state-driven props.
- **Calling `render(<App />)` twice in the same process.** Unmount the previous instance with `instance.unmount()` first.
- **Hand-rolling a text input with `useInput` + `useState`.** Use `<TextInput>`. The hand-rolled version misses caret rendering via `useDeclaredCursor`, smart bracketed paste, undo grouping, word nav, selection, wide-char math, and password masking — all of which TextInput handles.
- **Listening for paste in `useInput`.** Pastes ≤ 32 chars (default threshold) come through as a stream of regular keystrokes, not as a single string. For long pastes, attach `onPaste` on a `<Box>` to receive a `PasteEvent` with the full text.

## When you can't find what you need

- Read the [`patterns/`](patterns/) directory — the named patterns there cover most consumer needs.
- Read the demos in [`examples/`](../examples/) — each is a top-to-bottom `.tsx` file showing one interaction.
- Read the component's source in `packages/renderer/src/components/`. Yokai source is small and reading it is faster than guessing.
