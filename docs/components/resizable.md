# Resizable

Container that exposes grab handles on its bottom / right / SE corner and updates its own size as the user drags them.

## Import
```tsx
import { Resizable } from '@yokai/renderer'
import type { ResizeSize, ResizeHandleDirection, ResizeInfo } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `initialSize` | `ResizeSize` | required | `{ width, height }` cell dimensions before resize. Seed only; later changes ignored. |
| `minSize` | `ResizeSize` | `{ width: 1, height: 1 }` | Lower bound enforced at every motion event. |
| `maxSize` | `ResizeSize` | unbounded | Upper bound; omit to grow until the container or terminal stops it. |
| `handles` | `ResizeHandleDirection[]` | `['se']` | Subset of `'s' \| 'e' \| 'se'` to render. |
| `handleColor` | `Color` | `'gray'` | Idle handle background. |
| `handleHoverColor` | `Color` | `'white'` | Hover handle background. |
| `onResizeStart` | `(info: ResizeInfo) => void` | — | Fires on the first motion of a resize (not on press). |
| `onResize` | `(info: ResizeInfo) => void` | — | Fires on every cell-crossing motion event. |
| `onResizeEnd` | `(info: ResizeInfo) => void` | — | Fires once at release if the gesture became a resize. |

`ResizeInfo`: `{ size, startSize, delta: { dw, dh }, direction }`. `delta` is total cell delta from resize start.

All `<Box>` props are accepted except `width`, `height`, `onMouseDown` (owned internally). The default `overflow` is `'hidden'` but can be overridden via spread. See [box.md](./box.md).

## Examples
### Three-handle panel
```tsx
<Resizable
  initialSize={{ width: 30, height: 8 }}
  minSize={{ width: 10, height: 3 }}
  handles={['s', 'e', 'se']}
  borderStyle="single"
  onResizeEnd={({ size }) => persistPanelSize(size)}
>
  <Text>I'm resizable.</Text>
</Resizable>
```

## Behavior
- **Handle directions**:
  - `e` — east (right edge), width changes from cursor col delta.
  - `s` — south (bottom edge), height changes from cursor row delta.
  - `se` — south-east corner (rendered with `◢` glyph), both axes change.
- All three grow the box outward toward the bottom-right; the box's top-left stays put.
- **Per-axis clamping**: dragging SE past max-width but within max-height pins width and continues to grow height.
- **Handle isolation**: each handle calls `stopImmediatePropagation` on its mousedown, so a Resizable nested inside a Draggable won't start a drag when grabbed by a handle. Pressing elsewhere on the Resizable still bubbles.
- **z stacking**: SE handle paints over E and S edge strips when all three are enabled.
- Press without motion is not a resize — `onResizeStart` / `onResizeEnd` only fire if the cursor moves.
- Default `overflow: 'hidden'` hides transients where content briefly exceeds the box.

### Known limitation
- No autoFit. Content can be clipped if the box becomes smaller than its content; pick a `minSize` that matches your inner control.
- Only south / east / SE handles in v1. North / west / NW / SW / NE shift the layout origin and are deferred to a follow-up (cleanest for absolute-positioned Resizables).

## Related
- [`Draggable`](./draggable.md)
- [`Box`](./box.md)

## Source
[`packages/renderer/src/components/Resizable.tsx`](../../packages/renderer/src/components/Resizable.tsx)
