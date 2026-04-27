# Performance

Frame cost is dominated by tree size and changed-cell count, not by total rendered area; design components around that.

## Diff is O(changed cells)

`screen.diffEach` walks the new frame against the previous one cell by cell, comparing packed integer IDs (char/style/hyperlink interned in shared pools). Unchanged cells cost one int compare. A spinner update or a single streamed line emits ANSI for only the cells that actually changed.

Implication: a tall, mostly-static UI with a small animated region pays for the animated region. A tall UI that re-renders all of itself every tick pays for all of it — even if the rendered output is identical, the React reconciler and Yoga layout passes still run.

## When to memoize

Memoize expensive children that don't change between renders so React skips reconciliation:

```tsx
const list = useMemo(() => items.map(i =>
  <Row key={i.id} item={i} />
), [items])
```

The renderer package itself is built with the React Compiler (`tsup.config.ts`), so internal components get automatic memoization. User components don't unless you opt in or run the compiler in your own build.

## useAnimationFrame

Synchronized animations (spinners, streaming dots, progress bars) should share the clock via `useAnimationFrame` rather than each holding their own `setInterval`:

```tsx
const [ref, time] = useAnimationFrame(120)
const frame = Math.floor(time / 120) % FRAMES.length
```

The clock only runs when at least one keepAlive subscriber exists, slows when the terminal is blurred, and pauses for elements offscreen (via `useTerminalViewport`). Multiple animations stay in lockstep at no extra cost.

Pass `null` to pause without unmounting.

## ScrollBox for long lists

Any list past a few screens should live in `ScrollBox`. Viewport culling skips Yoga layout and render traversal for off-screen children — a 10000-row log costs O(visible) per frame, not O(total). DECSTBM scroll hints turn pure scroll into ~20 bytes of output regardless of row content.

For lists with very heavy per-row content or unbounded growth, layer a virtual-scroll abstraction on top that only mounts visible rows, then use `setClampBounds` to constrain the viewport against the mounted range.

## Tree size

Yoga layout is not free. A flat tree of 500 nodes lays out faster than a deeply nested 500-node tree because flexbox computation is dominated by recursive descent. Prefer flat compositions over wrapping each piece of state in its own Box.

## See also
- [Scrolling](../concepts/scrolling.md)
- [State management](../concepts/state.md)
- [useAnimationFrame](../hooks/use-animation-frame.md)
