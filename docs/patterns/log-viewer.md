# Log Viewer

Streaming log output with sticky-scroll auto-follow, level coloring, and inline search highlight. Reach for this in dev tools, build output panes, and any tail-style readout.

## Code

```tsx
import {
  AlternateScreen,
  Box,
  Button,
  ScrollBox,
  Text,
  render,
  useApp,
  useInput,
  useInterval,
  useSearchHighlight,
  type ScrollBoxHandle,
} from '@yokai/renderer'
import type React from 'react'
import { useEffect, useRef, useState } from 'react'

type Level = 'info' | 'warn' | 'error' | 'debug'
type Line = { id: number; ts: string; level: Level; text: string }

const LEVEL_COLOR: Record<Level, string> = {
  info: 'green',
  warn: 'yellow',
  error: 'red',
  debug: 'gray',
}

const SAMPLES: { level: Level; text: string }[] = [
  { level: 'info', text: 'server listening on :4000' },
  { level: 'debug', text: 'cache hit for key user:42' },
  { level: 'info', text: 'GET /api/jobs 200 12ms' },
  { level: 'warn', text: 'slow query: SELECT * FROM events (812ms)' },
  { level: 'error', text: 'unhandled rejection in worker pool' },
  { level: 'info', text: 'job 8a3 enqueued' },
  { level: 'debug', text: 'reaper swept 0 expired sessions' },
]

function tsNow(): string {
  return new Date().toISOString().slice(11, 23)
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const scrollRef = useRef<ScrollBoxHandle>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [paused, setPaused] = useState(false)
  const [query, setQuery] = useState('')
  const { setQuery: pushQuery } = useSearchHighlight()
  const idRef = useRef(0)

  useInterval(() => {
    const sample = SAMPLES[Math.floor(Math.random() * SAMPLES.length)]!
    setLines((prev) => {
      const next = prev.concat({ id: idRef.current++, ts: tsNow(), ...sample })
      return next.length > 5000 ? next.slice(-5000) : next
    })
  }, 250)

  useEffect(() => {
    pushQuery(query)
    return () => pushQuery('')
  }, [query, pushQuery])

  useInput((input, key) => {
    if (key.escape || (key.ctrl && input === 'c')) exit()
    if (key.backspace || key.delete) setQuery((q) => q.slice(0, -1))
    else if (input && !key.ctrl && !key.meta && input.length === 1) setQuery((q) => q + input)
  })

  function togglePause(): void {
    if (paused) {
      // Resume: jump to bottom and let stickyScroll re-engage.
      scrollRef.current?.scrollToBottom()
      setPaused(false)
    } else {
      // Pause: detach sticky by scrolling to current position.
      const top = scrollRef.current?.getScrollTop() ?? 0
      scrollRef.current?.scrollTo(top)
      setPaused(true)
    }
  }

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text bold>logs</Text>
          <Box flexDirection="row">
            <Text dim>filter: </Text>
            <Text>{query || '(none)'}</Text>
            <Box marginLeft={2}>
              <Button onPress={togglePause}>
                <Text>{paused ? '[ resume ]' : '[ pause ]'}</Text>
              </Button>
            </Box>
          </Box>
        </Box>

        <Box marginTop={1} borderStyle="single" height={20} flexDirection="column">
          <ScrollBox ref={scrollRef} stickyScroll={!paused} flexDirection="column">
            {lines.map((l) => (
              <Box key={l.id} flexDirection="row">
                <Text dim>{l.ts} </Text>
                <Text color={LEVEL_COLOR[l.level]}>{l.level.padEnd(5)} </Text>
                <Text>{l.text}</Text>
              </Box>
            ))}
          </ScrollBox>
        </Box>

        <Box marginTop={1}>
          <Text dim>type to filter, Backspace to delete, Esc quits</Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **`useInterval` produces fake lines at 250ms**: stand-in for whatever real source you'd attach (subprocess stdout, websocket, file tail). Lines are immutable and id-keyed so React diffs cheaply.
2. **Bounded buffer**: the producer caps `lines` at 5000 entries by slicing the tail. Without this, a long-lived viewer grows the React tree unbounded; viewport culling makes it cheap to render but the tree itself still costs memory.
3. **`<ScrollBox stickyScroll>` auto-follows**: while sticky, every new line pushes the viewport down so the latest entry stays visible. Manual `scrollBy` from the wheel detaches sticky automatically — the user scrolls up to inspect, the tail pauses on its own, scrolling back to the bottom re-pins.
4. **Pause / resume is imperative**: `togglePause` calls `scrollTo(getScrollTop())` to break stickiness without moving the view, and `scrollToBottom()` to re-engage it. The `stickyScroll={!paused}` prop reflects state so the prop and the imperative call agree.
5. **Level color via lookup**: `LEVEL_COLOR` keeps the row branch-free; padding the level name to 5 chars keeps columns aligned without a fixed-width Box.
6. **`useSearchHighlight().setQuery` inverts matches**: every visible occurrence of the current query is highlighted via SGR 7 on the next frame. Empty string clears. Effect cleanup clears on unmount so the highlight doesn't outlive the viewer.
7. **Search input via `useInput`**: printable single-character input appends to `query`, Backspace pops. No focus management needed because the viewer has no other text input.
8. **Viewport culling does the heavy lifting**: only lines intersecting the visible window reach the screen buffer. With 5000 entries and a 20-row viewport, each frame emits ~20 row-paints regardless of buffer size.

## Variations

- **Per-level filter**: keep a `Set<Level>` of enabled levels and filter `lines` before rendering. Buttons across the top toggle each level.
- **Jump to match**: pair `setQuery` with `setPositions` and a hotkey (n/N) that walks `currentIdx` through the position list, calling `scrollToElement` on the matching line.
- **Multi-source**: tag each line with `source: string` and render a colored prefix; filter by source the same way as level.
- **Persisted scrollback**: on mount, hydrate `lines` from disk; on every Nth append, debounce-write the tail back.
- **Word wrap vs truncate**: long lines wrap by default; switch to `wrap="truncate-end"` on the inner `<Text>` to keep one line per entry and trade detail for density.
- **Click-to-pin**: replace `<Text>` rows with `<Button>` rows whose `onPress` opens a detail modal with the full structured payload.

## Related

- [`ScrollBox`](../components/scrollbox.md)
- [`useSearchHighlight`](../hooks/use-search-highlight.md)
- [`useInterval`](../hooks/use-interval.md)
- [`useInput`](../hooks/use-input.md)
- [`Button`](../components/button.md)
