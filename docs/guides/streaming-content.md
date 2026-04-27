# Streaming content

How to render incremental content — LLM token streams, log tails, build output — without burning CPU or losing frames.

The yokai renderer diffs the screen cell-by-cell and emits only the ANSI patches needed to bring the terminal in sync with the new frame. Appending one character to a streamed response touches O(changed cells), not O(rows × cols). This makes the obvious approach — set state on every chunk, let React re-render, let yokai diff — viable up to surprisingly high update rates.

This guide covers when that obvious approach is right, when to throttle, and the patterns that fall apart under streaming load.

## Per-cell diffing pays off

Do not pre-debounce or coalesce text content unless profiling proves you need to. The renderer will collapse rapid setState calls into a single frame anyway (yokai schedules at most one frame per tick), and the diff between adjacent frames is cheap.

```tsx
function StreamingResponse({ stream }: { stream: AsyncIterable<string> }) {
  const [text, setText] = useState('')
  useEffect(() => {
    void (async () => {
      for await (const chunk of stream) {
        setText(prev => prev + chunk)
      }
    })()
  }, [stream])
  return <Text>{text}</Text>
}
```

This works for typical LLM token rates (10 - 100 tokens/sec). Each setState commits, the reconciler walks the tree, the renderer diffs a few changed cells, stdout receives a short ANSI patch.

## Sticky scroll

For log tails, chat UIs, build output — anywhere new lines arrive at the bottom and the user usually wants to follow — wrap the stream in `<ScrollBox stickyScroll>`.

```tsx
import { ScrollBox } from '@yokai/renderer'

<ScrollBox stickyScroll height={20}>
  {lines.map((line, i) => <Text key={i}>{line}</Text>)}
</ScrollBox>
```

Behavior:

| User action | Sticky behavior |
|-------------|-----------------|
| At bottom, content arrives | Auto-scrolls to keep new content visible |
| Manually scrolls up | Sticky pauses; new content does not steal viewport |
| Scrolls back to bottom | Sticky resumes |

See [`<ScrollBox>`](../components/scrollbox.md) and [patterns/log-viewer](../patterns/log-viewer.md).

## Accumulator state, not component-per-token

Append to one state slot. Do not mount a component per token.

```tsx
// Good — one state slot, append on each chunk
const [text, setText] = useState('')
setText(prev => prev + chunk)
return <Text>{text}</Text>

// Bad — mounts a new component per chunk
const [tokens, setTokens] = useState<string[]>([])
setTokens(prev => [...prev, chunk])
return <>{tokens.map((t, i) => <Text key={i}>{t}</Text>)}</>
```

Mount cost is per-React-commit and walks the reconciler / Yoga tree. Per-cell diff cost is far lower. The component-per-token form also bloats the React tree, and reconciliation eventually dominates frame time.

## Throttling when stream rate exceeds frame rate

When a stream produces faster than the renderer can flush (rare for text, common for raw byte streams or noisy log sources), batch with a queue and flush on an animation frame.

```tsx
import { useAnimationFrame } from '@yokai/renderer'

function ThrottledStream({ stream }: { stream: AsyncIterable<string> }) {
  const [text, setText] = useState('')
  const buffer = useRef('')

  useEffect(() => {
    void (async () => {
      for await (const chunk of stream) {
        buffer.current += chunk
      }
    })()
  }, [stream])

  useAnimationFrame(() => {
    if (buffer.current.length === 0) return
    const drained = buffer.current
    buffer.current = ''
    setText(prev => prev + drained)
  })

  return <Text>{text}</Text>
}
```

This caps the React commit rate at the frame rate while keeping the visible text fully up to date.

## Backpressure

If rendering still cannot keep up — say the terminal itself is slow over SSH — yokai's renderer is throttled internally to avoid frame stacking. Frames produced faster than they can be written are coalesced; the latest committed React state is what reaches the screen on the next available tick. You do not need to drop frames manually.

What you do need to manage: the stream source. If your accumulator grows without bound, memory is the problem, not framerate. See windowing below.

## Search highlight on streamed content

[`useSearchHighlight`](../hooks/use-search-highlight.md) scans every committed frame. Matches in newly-arrived content highlight on the first frame they appear. No special wiring needed — the scan runs against the post-layout cell grid, so streamed text is treated identically to static text.

```tsx
const { setQuery } = useSearchHighlight()
// later
setQuery('error')
// every subsequent frame highlights 'error' wherever it appears,
// including in streaming content
```

## Anti-patterns

### Render-per-token in a deeply-nested tree

Each setState walks the React tree from the source component. If the streaming `<Text>` lives 12 components deep, every chunk pays the full reconciliation cost on the path down. Hoist the streaming text up, or memoize the static parents with `React.memo`.

### Unbounded state

A 4-hour log tail in a single string is a memory leak. Cap the buffer:

```tsx
const MAX_LINES = 5000
setLines(prev => {
  const next = [...prev, ...newLines]
  return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
})
```

For chat-style UIs, window the visible range and load older history on scroll.

### Pre-batching when you do not need to

`setTimeout(() => setText(...), 16)` adds latency without buying anything — the renderer already coalesces. Batch only when profiling shows commits are the bottleneck.

### Mounting a `<ScrollBox>` per message

In a chat UI, one outer `<ScrollBox>` containing N message components. Not N ScrollBoxes. ScrollBox owns viewport-culling state; nesting them defeats the culling.

## See also

- [components/scrollbox](../components/scrollbox.md)
- [concepts/rendering](../concepts/rendering.md)
- [concepts/performance](../concepts/performance.md)
- [hooks/use-animation-frame](../hooks/use-animation-frame.md)
- [hooks/use-search-highlight](../hooks/use-search-highlight.md)
- [patterns/log-viewer](../patterns/log-viewer.md)
- [patterns/chat-ui](../patterns/chat-ui.md)
