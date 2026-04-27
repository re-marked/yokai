# Resizable Panes

A split view where the user drags a divider to repartition space between two panels. Reach for this when both halves need to grow or shrink — file tree + editor, master + detail, log + transcript.

## Code

### Approach A: two `<Resizable>` panels

```tsx
import { AlternateScreen, Box, Resizable, Text, render, useApp, useInput } from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const [leftSize, setLeftSize] = useState({ width: 30, height: 16 })
  const [rightSize, setRightSize] = useState({ width: 50, height: 16 })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>resizable panes — approach A</Text>
        <Text dim>drag the east edge of the left pane to resize it</Text>

        <Box flexDirection="row" gap={1} marginTop={1}>
          <Resizable
            initialSize={{ width: 30, height: 16 }}
            minSize={{ width: 10, height: 5 }}
            maxSize={{ width: 80, height: 30 }}
            handles={['e']}
            backgroundColor="#1a1a3a"
            onResize={({ size }) => setLeftSize(size)}
          >
            <Box padding={1}><Text>file tree ({leftSize.width}w)</Text></Box>
          </Resizable>

          <Resizable
            initialSize={{ width: 50, height: 16 }}
            minSize={{ width: 10, height: 5 }}
            handles={['e']}
            backgroundColor="#1a3a1a"
            onResize={({ size }) => setRightSize(size)}
          >
            <Box padding={1}><Text>editor ({rightSize.width}w)</Text></Box>
          </Resizable>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

### Approach B: fixed pane + flex-grow pane, divider drives the fixed width

```tsx
import {
  AlternateScreen,
  Box,
  Draggable,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

const MIN = 10
const MAX = 60

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const [leftWidth, setLeftWidth] = useState(30)

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1} height="100%">
        <Text bold>resizable panes — approach B</Text>
        <Text dim>drag the divider</Text>

        <Box flexDirection="row" flexGrow={1} marginTop={1}>
          <Box width={leftWidth} backgroundColor="#1a1a3a" padding={1}>
            <Text>file tree ({leftWidth}w)</Text>
          </Box>

          {/* 1-col-wide draggable divider. We let it drag freely on the
              x-axis and use onDrag's delta to update leftWidth, then
              snap the divider back via initialPos + the dragTick re-key. */}
          <Divider
            value={leftWidth}
            min={MIN}
            max={MAX}
            onChange={setLeftWidth}
          />

          <Box flexGrow={1} backgroundColor="#1a3a1a" padding={1}>
            <Text>editor (flex)</Text>
          </Box>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

function Divider({
  value,
  min,
  max,
  onChange,
}: {
  value: number
  min: number
  max: number
  onChange: (n: number) => void
}): React.ReactNode {
  const [tick, setTick] = useState(0)
  return (
    <Draggable
      key={tick}
      initialPos={{ top: 0, left: 0 }}
      width={1}
      height={20}
      backgroundColor="gray"
      onDrag={({ delta }) => {
        const next = Math.max(min, Math.min(max, value + delta.dx))
        if (next !== value) onChange(next)
      }}
      onDragEnd={() => setTick((t) => t + 1)}
    />
  )
}

render(<App />)
```

## How it works — Approach A

1. Two `<Resizable>` containers laid out in a row. Each owns its own width via internal state seeded from `initialSize`.
2. `handles={['e']}` exposes only the east edge — the right edge of each pane is the user's grab target.
3. `onResize` mirrors the size into local state for display; the resize itself happens inside `<Resizable>` regardless.
4. The divider is the visible east handle of the left pane. Dragging it grows the left pane and the right pane re-flows to fill remaining space (since neither pane has `flexGrow`, the parent row clips at the sum of widths — set `flexGrow={1}` on the right `<Resizable>` if you want the second pane to absorb leftover).
5. Each pane independently clamps via `minSize` / `maxSize`.

## How it works — Approach B

1. Left pane width is React state in the parent. Right pane is `flexGrow={1}` — its width is whatever's left over.
2. The divider is a 1-column-wide `<Draggable>`. We don't care about its absolute position; we only care about the delta on each motion event.
3. `onDrag` reads `delta.dx` and updates `leftWidth` directly, clamped to `[min, max]`.
4. The divider's own visual position resets to `left: 0` after each drag via the `tick` re-key. The pane width is the source of truth — the divider just emits deltas.
5. The right pane re-flows automatically because it's `flexGrow={1}`.

## Trade-offs

- **Approach A** is less code and works without a custom divider component, but both panes are absolutely sized — you must manage total-width fit yourself if the terminal resizes.
- **Approach B** is more explicit but plays nicely with flexbox: the right pane absorbs leftover space and a `useTerminalViewport` re-render rebalances cleanly. Use this when one side should always fill remaining space.

## Variations

- **Vertical split**: swap `flexDirection` to `column` and use `handles={['s']}` (Approach A) or update `delta.dy` (Approach B).
- **Three panes**: chain three `<Resizable>` panels with `handles={['e']}` on the first two. Or two dividers in Approach B, each driving a different fixed-width state.
- **Snap-to-presets**: in Approach B, on `onDragEnd` snap `leftWidth` to the nearest preset (e.g. `[20, 40, 60]`) instead of the live value.
- **Persist split**: write `leftWidth` (or each pane's `size`) to disk on `onResizeEnd` / `onDragEnd`; hydrate on mount.
- **Min/max enforcement**: Approach A uses `minSize` / `maxSize` props; Approach B clamps in the `onDrag` handler — pick whichever fits where the rest of your layout logic lives.

## Related

- [`Resizable`](../components/resizable.md)
- [`Draggable`](../components/draggable.md)
- [`useTerminalViewport`](../hooks/use-terminal-viewport.md)
- Demo: [`examples/resizable/resizable.tsx`](../../examples/resizable/resizable.tsx)
