# useAnimationFrame

Synchronized animation clock that pauses when the attached element is offscreen.

## Import
```tsx
import { useAnimationFrame } from '@yokai/renderer'
```

## Signature
```tsx
function useAnimationFrame(
  intervalMs: number | null = 16,
): [ref: (element: DOMElement | null) => void, time: number]
```

## Parameters
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `intervalMs` | `number \| null` | `16` | Update period in ms. `null` pauses (unsubscribes from the clock). |

## Returns
| Index | Type | Description |
|-------|------|-------------|
| `[0]` | `(el: DOMElement \| null) => void` | Ref callback. Attach to the animated `Box` for viewport-aware pause. |
| `[1]` | `number` | Current clock time in ms; advances by ≥ `intervalMs` per update. |

Subscribes as **keepAlive** — visible animations drive the shared clock. Time freezes at the last value when paused and resumes from the current clock time when reactivated. The clock automatically slows when the terminal is blurred.

## Examples
### Basic
```tsx
function Spinner() {
  const [ref, time] = useAnimationFrame(120)
  const frame = Math.floor(time / 120) % FRAMES.length
  return <Box ref={ref}>{FRAMES[frame]}</Box>
}
```

### Conditional pause
```tsx
const [ref, time] = useAnimationFrame(loading ? 80 : null)
```

## When to use
- Visible, sync-critical animation (spinner, shimmer, progress).
- Reach for `useAnimationTimer` when no element ref is needed and the timer should not keep the clock alive on its own.

## Related
- [`useInterval` / `useAnimationTimer`](./use-interval.md)
- `useTerminalViewport`

## Source
[`packages/renderer/src/hooks/use-animation-frame.ts`](../../packages/renderer/src/hooks/use-animation-frame.ts)
