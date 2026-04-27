# useInterval

Interval and time-tick hooks backed by the shared Clock.

## Import
```tsx
import { useInterval, useAnimationTimer } from '@yokai/renderer'
```

## Signatures
```tsx
function useInterval(callback: () => void, intervalMs: number | null): void
function useAnimationTimer(intervalMs: number): number
```

Both subscribe to the shared `ClockContext` instead of creating their own `setInterval`. All timers consolidate into a single wake-up.

## useInterval

### Parameters
| Field | Type | Description |
|-------|------|-------------|
| `callback` | `() => void` | Fires when `intervalMs` has elapsed since the last call. Latest reference is used (no stale closure). |
| `intervalMs` | `number \| null` | Period in ms. `null` pauses the interval. |

Subscribes as **non-keepAlive** — does not keep the clock running on its own. Fires only while another keepAlive subscriber (e.g. an active spinner) is driving ticks.

### Example
```tsx
function Poller() {
  useInterval(() => refresh(), paused ? null : 1000)
  return null
}
```

## useAnimationTimer

### Parameters
| Field | Type | Description |
|-------|------|-------------|
| `intervalMs` | `number` | Granularity at which the returned time advances. |

### Returns
| Type | Description |
|------|-------------|
| `number` | Current clock time in ms, updated at most every `intervalMs`. |

Use to drive pure time-based computation (shimmer offset, frame index) from the shared clock. Non-keepAlive.

### Example
```tsx
function Shimmer() {
  const t = useAnimationTimer(80)
  const offset = (t / 80) % WIDTH
  return <Text>{render(offset)}</Text>
}
```

## When to use
- `useInterval` — fire a side-effect on a cadence; pause cleanly with `null`.
- `useAnimationTimer` — compute view from time without owning a callback.
- `useAnimationFrame` — when ticks must keep the clock alive (visible animation).

## Related
- [`useAnimationFrame`](./use-animation-frame.md)
- `ClockContext`

## Source
[`packages/renderer/src/hooks/use-interval.ts`](../../packages/renderer/src/hooks/use-interval.ts)
