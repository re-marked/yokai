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

**`<Box>`** — flex container. Accepts all Yoga layout props: `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `alignItems`, `justifyContent`, `gap`, `margin`, `padding`, `width`, `height`, `position`, `top`, `left`, `right`, `bottom`, `overflow`.

**`<Text>`** — text node. Accepts `color`, `backgroundColor`, `bold`, `italic`, `underline`, `dimColor`, `wrap`.

**`<ScrollBox>`** — scrollable container with imperative scroll API, sticky scroll, viewport culling, and DECSTBM hardware scroll hints.

**`<AlternateScreen>`** — enters the terminal alternate buffer with optional mouse tracking on mount, exits cleanly on unmount.

**`<Link>`** — OSC 8 hyperlink.

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
  onMouseDown={(e) => console.log(e.col, e.row)}
  onKeyDown={(e) => console.log(e.key)}
>
```

## Hooks

| Hook | Description |
|------|-------------|
| `useInput(handler, options?)` | Raw keyboard input |
| `useApp()` | `{ exit }` |
| `useStdin()` | Stdin stream + `isRawModeSupported` |
| `useStdout()` | Stdout stream + `write` |
| `useTerminalViewport()` | `{ columns, rows }`, updates on resize |
| `useFocusManager()` | `focus`, `focusNext`, `focusPrevious` |
| `useFocus(options?)` | Focus state for the current component |
| `useInterval(fn, ms)` | Stable interval that cleans up on unmount |

## Development

```bash
pnpm install
pnpm build          # shared → renderer
pnpm typecheck      # both packages
pnpm lint           # biome
pnpm test           # vitest
```

## License

MIT
