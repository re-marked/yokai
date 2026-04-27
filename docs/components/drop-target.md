# DropTarget

Region that receives drop callbacks from active `<Draggable>` gestures.

## Import
```tsx
import { DropTarget } from '@yokai/renderer'
import type { DropInfo } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `accept` | `(data: unknown) => boolean` | accepts all | Predicate gating participation. When it returns false, the target is invisible to the drag — no callbacks fire and a target underneath can receive instead. |
| `onDragEnter` | `(info: DropInfo) => void` | — | Fires once when the cursor first enters this target's rect during an active drag. |
| `onDragOver` | `(info: DropInfo) => void` | — | Fires on every motion while cursor is inside this target's rect. |
| `onDragLeave` | `() => void` | — | Fires when cursor leaves the rect, or when the drag ends while still inside. |
| `onDrop` | `(info: DropInfo) => void` | — | Fires only on the topmost containing target at release. |

`DropInfo`: `{ data, cursor: { col, row }, local: { col, row } }`. `local` is cursor offset relative to this target's top-left in cell coordinates.

All `<Box>` props are accepted except `ref` (used internally). See [box.md](./box.md).

## Examples
### Card drop column
```tsx
<DropTarget
  accept={(d) => (d as { kind?: string } | undefined)?.kind === 'card'}
  onDragEnter={() => setHover(true)}
  onDragLeave={() => setHover(false)}
  onDrop={({ data }) => moveCardToColumn((data as Card).id, columnId)}
  backgroundColor={hover ? 'blue' : 'gray'}
  width={30}
  height={10}
/>
```

## Behavior
- Targets are inert outside an active drag.
- `accept` is re-evaluated on every cursor motion — a target that rejected at one tick can accept at a later tick.
- `onDragEnter` / `onDragOver` / `onDragLeave` fire on every containing target (nested targets all receive them).
- `onDrop` dispatches only to the topmost target by paint order: highest z-index wins, deeper-in-tree breaks ties.
- The latest callback values are read each tick via a ref, so closures stay current with React state.

## Related
- [`Draggable`](./draggable.md)
- [`Box`](./box.md)

## Source
[`packages/renderer/src/components/DropTarget.tsx`](../../packages/renderer/src/components/DropTarget.tsx)
