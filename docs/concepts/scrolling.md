# Scrolling

`ScrollBox` is a viewport-clipped Box with an imperative scroll API, sticky-bottom mode, viewport culling, and DECSTBM hardware scroll hints.

## Imperative API

`ScrollBox` exposes its handle via `ref`. Methods mutate `scrollTop` directly on the DOM node and schedule a render — they do not flow through React state.

```tsx
const ref = useRef<ScrollBoxHandle>(null)

ref.current?.scrollTo(120)
ref.current?.scrollBy(-40)
ref.current?.scrollToBottom()
ref.current?.scrollToElement(domEl, /* offset */ -2)
```

`scrollToElement` is preferable to `scrollTo` when targeting a specific child: it defers the position read to render time and computes the target from the same Yoga layout pass that produces `scrollHeight`, avoiding stale-number races that occur when content is streaming in.

Multiple `scrollBy` calls inside one input batch coalesce into a single render via `queueMicrotask`.

## Sticky scroll

```tsx
<ScrollBox stickyScroll>{lines}</ScrollBox>
```

When `stickyScroll` is true, the viewport pins to the bottom while content grows. Any explicit `scrollTo` / `scrollBy` breaks stickiness; `scrollToBottom` re-establishes it. `isSticky()` reports the current pinned state.

## Viewport culling

Children are laid out at their full Yoga-computed height inside a clipped container. At render time, `renderScrolledChildren` skips any child whose Yoga rect doesn't intersect `[scrollTop, scrollTop + viewportHeight]`. A 10000-row chat log costs O(visible rows) to render, not O(total).

Content is translated by `-scrollTop` and clipped to the box bounds.

## DECSTBM hardware scroll hints

When the only thing that changed between two frames is a ScrollBox's `scrollTop` (the content that scrolled into view was already in the buffer at the new position), `log-update` emits a DECSTBM scroll-region command (`CSI top;bottom r` + `CSI N S`/`T`) instead of repainting the affected rows.

This turns a 50-row scroll into ~20 bytes of output regardless of row content. The terminal does the pixel shift natively. Falls back to per-cell diff when the heuristic doesn't apply (mixed updates, content changes, partial overlap).

## Clamp bounds

`setClampBounds(min, max)` constrains `scrollTop` at render time to the currently-mounted children's coverage span. Used by virtual scrolling: when a burst of `scrollTo` calls races past React's async re-render of the visible window, the clamp snaps to the edge of mounted content rather than blank spacer.

## See also
- [State management](../concepts/state.md)
- [Performance](../concepts/performance.md)
- [Selection](../concepts/selection.md)
- [ScrollBox](../components/scrollbox.md)
