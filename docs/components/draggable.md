# Draggable

Press-hold-drag-release rectangle that updates its absolute position from cursor motion.

## Import
```tsx
import { Draggable } from '@yokai-tui/renderer'
import type { DragPos, DragBounds, DragInfo } from '@yokai-tui/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialPos` | `DragPos` | required | `{ top, left }` cell offsets relative to parent's content edge. Seed only; changes after mount are ignored. |
| `bounds` | `DragBounds` | — | `{ width, height }` clamp region in parent content space. Omit for unbounded drag. |
| `disabled` | `boolean` | `false` | Press events ignored — no gesture capture, no z-bump, no callbacks. Element still renders. |
| `dragData` | `unknown` | — | Payload forwarded to `<DropTarget>` callbacks. Cast on receiving side. |
| `onDragStart` | `(info: DragInfo) => void` | — | Fires once on first cursor motion after press (not on press itself). |
| `onDrag` | `(info: DragInfo) => void` | — | Fires on every cell-crossing motion, after internal pos state updates. |
| `onDragEnd` | `(info: DragInfo) => void` | — | Fires once at release if the gesture became a drag. `info.dropped` is `true` if a `<DropTarget>` accepted. |
| `onMouseDown` | `(event: MouseDownEvent) => void` | — | Optional consumer press handler. Fires BEFORE Draggable's internal drag wiring — useful for "raise window on press" / app-level focus updates. Consumer may call `event.captureGesture(...)` to preempt the drag (first-call-wins per [`MouseDownEvent`](../reference/events.md#mousedownevent)). The press-time z-bump still fires either way; use `disabled` to suppress press behavior entirely. |

`DragInfo`: `{ pos, startPos, delta: { dx, dy }, dropped? }`. `delta` is screen-space cell delta from press point, not from previous frame.

All `<Box>` props are accepted except `position`, `top`, `left` (owned internally). `onMouseDown` IS forwarded; see the row above for the chain semantics. See [box.md](./box.md) for the rest.

## Examples
### Bounded drag with persistence
```tsx
<Draggable
  initialPos={{ top: 0, left: 0 }}
  width={20}
  height={3}
  bounds={{ width: 80, height: 24 }}
  backgroundColor="cyan"
  onDragEnd={({ pos }) => persist(pos)}
/>
```

## Behavior
- **Press anchors at cursor offset**: the grabbed point stays under the cursor as the box moves.
- **Raise on press**: each press bumps the box's z-index (starting at `BASE_Z = 10`). Persists after release so the most-recently-grabbed box stays on top.
- **Drag-time z boost**: while dragging, the box paints `+1000` (`DRAG_Z_BOOST`) above its persisted z so it wins paint over any sibling.
- **Bounds clamping** is inclusive: top-left ranges over `[(0,0), (bounds.width - width, bounds.height - height)]`.
- **Drop integration**: `startDrag` engages on first motion, `tickDrag` fires after each `setPos`, `dispatchDrop` runs at release before `endDrag`.
- **Press without motion is not a drag**: `onDragStart` / `onDragEnd` only fire if the cursor moves.

### Click vs. drag disambiguation
Draggable installs a TENTATIVE gesture on press. The gesture is committed only when actual motion follows; a press-and-release with no motion silently drops the gesture and falls through to normal click dispatch. Practical effect: a `<Box onClick>` (or `<TextInput>`, `<Button>`, etc.) inside a `<Draggable>` reliably receives its click on a press-without-motion — no `stopImmediatePropagation` boilerplate required.

Once motion begins, the gesture is promoted: any in-progress text selection from the press is cancelled, `onMove` fires, and the release goes to `onUp` instead of being dispatched as a click.

## Related
- [`DropTarget`](./drop-target.md)
- [`Box`](./box.md)
- [Window pattern](../patterns/window.md) — interim recipe for building draggable window-shaped UIs on top of `<Draggable>`

## Source
[`packages/renderer/src/components/Draggable.tsx`](../../packages/renderer/src/components/Draggable.tsx)
