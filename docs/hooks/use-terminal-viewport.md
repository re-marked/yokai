# useTerminalViewport

Detect whether an element is currently within the visible terminal viewport.

## Import
```tsx
import { useTerminalViewport } from '@yokai/renderer'
```

## Signature
```tsx
function useTerminalViewport(): [
  ref: (element: DOMElement | null) => void,
  entry: { isVisible: boolean },
]
```

The entry object is updated in place during `useLayoutEffect` on every render. Visibility changes do **not** trigger a re-render — callers re-rendering for other reasons (animation tick, state change) will read the latest value. This avoids cascade loops with sibling layout effects.

The walk traverses the DOM ancestor chain (not yoga's parent) so `scrollTop` from enclosing `ScrollBox` containers is subtracted, and uses the layout root's height as the viewport reference. Elements at the bottom edge account for the one-row scrollback adjustment performed by the frame writer.

## Returns
| Index | Type | Description |
|-------|------|-------------|
| `0` | `(el: DOMElement \| null) => void` | Callback ref to attach to the tracked element. |
| `1` | `{ isVisible: boolean }` | Mutable entry; `isVisible` reflects whether any portion of the element overlaps the viewport. Defaults to `true` until first measurement. |

## Examples
### Pause animation when offscreen
```tsx
const [ref, entry] = useTerminalViewport()
return (
  <Box ref={ref}>
    <Spinner enabled={entry.isVisible} />
  </Box>
)
```

## When to use
Long-running animations, polling, or expensive renders that should stop when scrolled out of the visible region.

## Related
- [`ScrollBox`](../components/scrollbox.md) — viewport culling target.

## Source
[`packages/renderer/src/hooks/use-terminal-viewport.ts`](../../packages/renderer/src/hooks/use-terminal-viewport.ts)
