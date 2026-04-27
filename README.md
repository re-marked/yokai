# yokai

React terminal renderer. Pure-TypeScript Yoga flexbox, diff-based screen output, ScrollBox with viewport culling and hardware scroll hints.

Used by [claude-corp](https://github.com/re-marked/claude-corp). Forked from [claude-code-kit](https://github.com/minnzen/claude-code-kit), itself a fork of [Ink](https://github.com/vadimdemedes/ink).

## Packages

| Package | Description |
|---------|-------------|
| [`@yokai/renderer`](./packages/renderer) | React reconciler, component library, event system, terminal I/O |
| [`@yokai/shared`](./packages/shared) | Pure-TypeScript Yoga layout engine, logging, env helpers |

## How it works

```
React component tree
  → Reconciler (React 19 host config)
  → DOM + Yoga layout
  → Tree traversal + text wrapping
  → Screen buffer (cell grid)
  → Frame diff → ANSI patches
  → stdout
```

The renderer double-buffers frames, diffs cell-by-cell, and emits only the minimal ANSI patch sequence each tick. A spinner update or a line of streamed text touches O(changed cells), not O(rows × cols).

## Components

```tsx
import { render, Box, Text, ScrollBox } from '@yokai/renderer'

function App() {
  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1}>
        <ScrollBox stickyScroll>
          <Text>streaming content…</Text>
        </ScrollBox>
      </Box>
      <Box>
        <Text>footer</Text>
      </Box>
    </Box>
  )
}

render(<App />)
```

**`<Box>`** — flex container. Accepts all Yoga layout props: `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `justifyContent`, `gap`, `margin`, `padding`, `width`, `height`, `position`, `top`, `left`, `right`, `bottom`, `overflow`, `zIndex` (only honored on `position: 'absolute'`).

**`<Text>`** — text node. Accepts `color`, `backgroundColor`, `bold`, `italic`, `underline`, `dimColor`, `wrap`.

**`<ScrollBox>`** — scrollable container with imperative scroll API, sticky scroll, viewport culling, and DECSTBM hardware scroll hints.

**`<AlternateScreen>`** — enters the terminal alternate buffer with optional mouse tracking on mount, exits cleanly on unmount.

**`<Link>`** — OSC 8 hyperlink.

**`<Draggable>`** — gesture-captured drag primitive. Raise-on-press, drag-time z boost, optional `bounds` clamp, `onDragStart` / `onDrag` / `onDragEnd`. `dragData` payload forwarded to drop targets.

**`<DropTarget>`** — receiver side of drag-and-drop. Optional `accept(data) => boolean` filter, hover lifecycle (`onDragEnter` / `onDragOver` / `onDragLeave`), `onDrop` on the topmost target containing the cursor at release.

**`<Resizable>`** — resize primitive with `s`, `e`, `se` handles. Hover-highlighted chrome, `minSize` / `maxSize` clamping, `onResizeStart` / `onResize` / `onResizeEnd`. Defaults `overflow: 'hidden'` to keep content from bleeding outside the box.

**`<FocusGroup>`** — adds arrow-key navigation between focusable descendants without interfering with Tab. `direction="row" | "column" | "both"`, optional `wrap`, optional `isActive`. Tab still cycles globally; arrows are bounded to the group.

**`<FocusRing>`** — focusable Box with built-in focus-visible border indicator (default `cyan` border on focus). Pair with `<FocusGroup>` for keyboard-navigable lists / menus.

**`<TextInput>`** — editable text. Single-line or multiline. Caret via the real terminal cursor (IME / a11y correct). Smart bracketed paste, undo/redo, word nav, selection, password masking. See [docs/components/text-input.md](./docs/components/text-input.md).

## ScrollBox API

```tsx
const ref = useRef<ScrollBoxRef>(null)

<ScrollBox ref={ref} stickyScroll>
  {items}
</ScrollBox>

// Imperative scroll
ref.current.scrollTo(100)
ref.current.scrollBy(10)
ref.current.scrollToBottom()
ref.current.scrollToElement(elementRef, { offset: 2 })
```

## Mouse and keyboard

Mouse tracking is enabled inside `<AlternateScreen mouseTracking>`. Events are dispatched through the component tree with capture and bubble phases, matching browser event semantics.

```tsx
<Box
  onClick={(e) => console.log(e.col, e.row)}
  onMouseDown={(e) => console.log(e.col, e.row)}
  onMouseEnter={() => console.log('hover')}
  onMouseLeave={() => console.log('leave')}
  onKeyDown={(e) => console.log(e.key)}
>
```

### Gesture capture

Inside `onMouseDown`, call `event.captureGesture({ onMove, onUp })` to claim subsequent mouse-motion events and the eventual release for that one drag. Selection extension is suppressed for the duration; the captured handlers fire even when the cursor leaves the originally-pressed element's bounds.

```tsx
<Box
  onMouseDown={(e) => {
    e.captureGesture({
      onMove: (m) => console.log('drag at', m.col, m.row),
      onUp: (u) => console.log('release at', u.col, u.row),
    })
  }}
/>
```

`<Draggable>`, `<DropTarget>`, and `<Resizable>` are all built on top of this primitive. Reach for them first; reach for raw `captureGesture` when none of the components fit your interaction.

## Keyboard navigation

Tab / Shift+Tab cycle through every `tabIndex >= 0` element in the tree (built into the renderer — no setup needed). Arrow-key navigation is opt-in via `<FocusGroup>`, scoped to its descendants — Tab still cycles globally, arrows are bounded.

```tsx
import { FocusGroup, FocusRing, Text, useFocusManager } from '@yokai/renderer'

function Menu({ items }) {
  return (
    <FocusGroup direction="column" wrap>
      {items.map((item) => (
        <FocusRing key={item.id} paddingX={1}>
          <Text>{item.label}</Text>
        </FocusRing>
      ))}
    </FocusGroup>
  )
}
```

`<FocusRing>` adds a focus-visible border (default cyan) to the focused item — a thin Box wrapper around `useFocus` that you can replace with custom chrome by inlining `useFocus()` directly.

For programmatic focus (modal pulling focus on open, status bar showing the focused element), use `useFocusManager()`:

```tsx
const { focused, focus, focusNext, focusPrevious, blur } = useFocusManager()
```

For per-element tracking, `useFocus()`:

```tsx
const { ref, isFocused, focus } = useFocus({ autoFocus: true })
return <Box ref={ref} tabIndex={0} ...>...</Box>
```

See `pnpm demo:focus-nav` for a live example with two `<FocusGroup>`s side-by-side, one column-direction and one row-direction.

## Demos

```bash
pnpm demo:drag                # three overlapping draggable rectangles
pnpm demo:constrained-drag    # constrained-vs-free drag inside containers
pnpm demo:drag-and-drop       # kanban: cards into columns
pnpm demo:resizable           # two panels, three handles each
pnpm demo:focus-nav           # Tab + arrow navigation between FocusGroups
pnpm demo:text-input          # text input fields: single, multiline, password
```

Each demo lives in `examples/` and is a small `.tsx` file you can read top-to-bottom — they're meant to be the first place you look when wiring a new interaction.

## Consumption

```jsonc
// package.json
"dependencies": {
  "@yokai/renderer": "github:re-marked/yokai#v0.5.1"
}
```

Pin to a tag, not `main` — `main` moves. See [release notes](https://github.com/re-marked/yokai/releases) for what's in each version.

## Hooks

| Hook | Description |
|------|-------------|
| `useInput(handler, options?)` | Raw keyboard input |
| `useApp()` | `{ exit }` |
| `useStdin()` | Stdin stream + `isRawModeSupported` |
| `useStdout()` | Stdout stream + `write` |
| `useTerminalViewport()` | `{ columns, rows }`, updates on resize |
| `useFocus(options?)` | `{ ref, isFocused, focus }` — per-element focus tracking + imperative focus |
| `useFocusManager()` | `{ focused, focus, focusNext, focusPrevious, blur }` — global focus actions, reactive to changes |
| `useInterval(fn, ms)` | Stable interval that cleans up on unmount |

## Development

```bash
pnpm install
pnpm build          # shared → renderer
pnpm typecheck      # both packages
pnpm lint           # biome
pnpm test           # vitest
```

## Documentation

Full reference under [`docs/`](./docs/) — getting started, conceptual guides, per-component and per-hook reference, real-world patterns, migration from Ink, and an [AGENTS.md](./docs/AGENTS.md) for AI assistants writing code that uses yokai.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the rules of the road — branching, granular commits, co-authorship, quality bar, and release workflow.

## License

MIT
