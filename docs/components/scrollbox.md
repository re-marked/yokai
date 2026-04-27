# ScrollBox

A constrained-height container with `overflow: scroll`, viewport culling, and an imperative scroll API.

## Import
```tsx
import { ScrollBox, type ScrollBoxHandle } from '@yokai/renderer'
```

## Props

All `<Box>` props are accepted (see [Box](box.md)) except `textWrap`, `overflow`, `overflowX`, `overflowY` (forced to `scroll`).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `ref` | `Ref<ScrollBoxHandle>` | — | Imperative handle — see API below |
| `stickyScroll` | `boolean` | `false` | Auto-pin to bottom when content grows; cleared by manual `scrollTo` / `scrollBy` |

## ScrollBoxHandle

| Method | Signature | Notes |
|--------|-----------|-------|
| `scrollTo` | `(y: number) => void` | Set absolute `scrollTop`; clears stickiness |
| `scrollBy` | `(dy: number) => void` | Accumulates into `pendingScrollDelta`; renderer drains at capped rate |
| `scrollToBottom` | `() => void` | Set sticky; forces a React render |
| `scrollToElement` | `(el: DOMElement, offset?: number) => void` | Defer-resolves the element's top during the next Yoga pass — race-free against streaming content |
| `getScrollTop` | `() => number` | Current `scrollTop` |
| `getPendingDelta` | `() => number` | Accumulated-but-not-yet-drained delta |
| `getScrollHeight` | `() => number` | Cached content height (up to ~16ms stale) |
| `getFreshScrollHeight` | `() => number` | Native Yoga read; use after a layout-effect commit |
| `getViewportHeight` | `() => number` | Visible content height (inside padding) |
| `getViewportTop` | `() => number` | Absolute screen-buffer row of the first visible content line |
| `isSticky` | `() => boolean` | `true` if pinned to bottom |
| `subscribe` | `(listener: () => void) => () => void` | Notified on imperative scroll changes; not on sticky-driven follow |
| `setClampBounds` | `(min: number \| undefined, max: number \| undefined) => void` | Clamp `scrollTop` to currently-mounted children's coverage span |

## Examples

### Basic
```tsx
const ref = useRef<ScrollBoxHandle>(null)

<ScrollBox ref={ref} height={10} flexDirection="column">
  {lines.map((l, i) => <Text key={i}>{l}</Text>)}
</ScrollBox>
```

### Sticky log tail
```tsx
<ScrollBox stickyScroll height={20} flexDirection="column">
  {logs.map((l) => <Text key={l.id}>{l.text}</Text>)}
</ScrollBox>
```

### Scroll to element
```tsx
const itemRef = useRef<DOMElement>(null)
const boxRef = useRef<ScrollBoxHandle>(null)
// later
boxRef.current?.scrollToElement(itemRef.current!, -1)
```

## Behavior

- `scrollTo` / `scrollBy` mutate the DOM node directly and bypass React; updates are coalesced via microtask before scheduling a render.
- Only children intersecting `[scrollTop, scrollTop + height]` are emitted to the screen buffer (viewport culling).
- Inner content uses `flexGrow: 1, flexShrink: 0, width: '100%'` so flexbox spacers can pin children to the bottom of the viewport.
- `stickyScroll` is set as a DOM attribute so the first frame already knows it; ref callbacks fire too late.
- `scrollToBottom` and explicit `scrollToElement` cancel any in-flight `pendingScrollDelta`.
- Mouse-wheel events are dispatched as `ParsedKey` wheel events when inside `<AlternateScreen>` with mouse tracking; the consumer wires them to `scrollBy`.
- `setClampBounds` lets a consumer pin the scroll range to a specific bound, useful when virtualising long lists where the natural max scroll lags React's async re-render.

## Related
- [Box](box.md), [AlternateScreen](alternate-screen.md)
- [Scrolling and viewport culling](../concepts/scrolling.md)

## Source
[`packages/renderer/src/components/ScrollBox.tsx`](../../packages/renderer/src/components/ScrollBox.tsx)
