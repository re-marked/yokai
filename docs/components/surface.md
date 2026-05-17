# Surface

The foundational rectangle primitive that every desktop UI element in yokai is built from. A Surface is a paintable, layered, optionally hit-test-bounded region that higher-level primitives (`<Window>`, modal panels, popovers, tooltips, dropdowns, drag ghosts, backdrops) compose to share a single vocabulary for paint / layout / layer / clip / hit-test / elevation.

`<Surface>` is **not** a window — no titlebar, no drag state, no resize handles, no focus ownership, no window-manager policy. Those live in higher-level components that use Surface as their paint substrate. `<Draggable>` and `<Resizable>` paint through Surface so their layering, clipping, and hit-test behavior matches anything else built on the foundation.

## Import

```tsx
import { Surface } from '@yokai-tui/renderer'
import type { SurfaceProps, SurfaceLayer, SurfaceElevation } from '@yokai-tui/renderer'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `position` | `'relative' \| 'absolute'` | `'relative'` | CSS-flex position. `hitTestBoundary`, `elevation`, and `backdrop` only take effect when `'absolute'`. |
| `top` / `left` / `right` / `bottom` / `width` / `height` | per `Styles` | — | Pass through to ink-box. Apply per CSS for absolute Surfaces; ignored for relative. |
| `flexDirection` / `flexGrow` / `flexShrink` / `flexWrap` / `alignItems` / `alignSelf` / `justifyContent` / `gap` / `columnGap` / `rowGap` | per `Styles` | — | Flex layout passthrough. |
| `borderStyle` / `borderColor` / `borderTop` / `borderRight` / `borderBottom` / `borderLeft` / `border{Side}Color` / `borderDimColor` | per `Styles` | — | Border passthrough. |
| `backgroundColor` | `Color` | — | Background fill — Surface paints the entire interior (including padding) with this color before children. |
| `padding` / `paddingX` / `paddingY` / `padding{Side}` | `number` | — | Padding passthrough. |
| `margin` / `marginX` / `marginY` / `margin{Side}` | `number` | — | Margin passthrough. |
| `overflow` / `overflowX` / `overflowY` | per `Styles` | — | Explicit overflow override; wins over `clip` when set. |
| `layer` | `SurfaceLayer` | `'base'` | Named z-band — see table below. Resolves to `zIndex` internally. Only applied when `position='absolute'` (renderer's existing zIndex-on-absolute rule). |
| `zIndex` | `number` | — | Numeric escape hatch. **Wins over `layer`** when both are supplied. |
| `clip` | `'hidden' \| 'visible'` | `'visible'` | Convenience for `overflow: 'hidden'`. Explicit `overflow*` props win when set. |
| `hitTestBoundary` | `boolean` | `false` | Marks this Surface as owning the cells it covers — lower-z absolute siblings beneath the boundary's rect cannot receive mouse events at those cells. Modals / popovers / menus set this; tooltips / drag ghosts typically don't. Must be combined with `position='absolute'` (dev-warn + silently ignored otherwise). |
| `elevation` | `0 \| 1 \| 2 \| 3 \| 4 \| 5` | `0` | Drop-shadow band thickness in cells, offset down-right of the rect. `0` = no shadow. Only paints when `position='absolute'`. |
| `shadowColor` | `Color` | `'#1a1a1a'` (near-black) | Solid fill color for the elevation shadow band. The default reads well on light themes but is near-invisible on dark themes — set a brighter value (`'#404040'`, `'#475569'`, …) when consuming Surface on a dark background. Only applied when `elevation > 0`. Terminals don't support alpha; this is a solid fill. |
| `backdrop` | `boolean` | `false` | Auto-renders a sibling scrim Box behind this Surface, filling the parent at `(resolvedZ - 1)`. Only meaningful when `position='absolute'`. |
| `backdropColor` | `Color` | `'black'` | Scrim color when `backdrop=true`. Terminals don't support alpha; this is a solid fill. |
| `ref` | `Ref<DOMElement>` | — | Pass through to ink-box. |
| `tabIndex` / `autoFocus` / `claimFocusOnClick` | per `Box` | — | Focus passthrough. |
| `onClick` / `onMouseDown` / `onMouseEnter` / `onMouseLeave` / `onKeyDown` / `onFocus` / `onBlur` / `onPaste` (+ capture variants) | per `Box` | — | Event handler passthrough. |
| `children` | `ReactNode` | — | Pass through. |

## Layer table

| Layer | z-band | Use |
|---|---|---|
| `'base'` | 0 | Default — equivalent to no layer (no `zIndex` set). |
| `'docked'` | 100 | Pinned sidebars, status bars, taskbars above base content. |
| `'overlay'` | 1000 | Floating panels (`<Window>` body). |
| `'dropdown'` | 2000 | Select / menu dropdowns above panels. |
| `'modal'` | 3000 | Modal dialogs + their backdrops. |
| `'popover'` | 4000 | Popovers anchored to elements. |
| `'tooltip'` | 5000 | Tooltips above popovers. |
| `'drag-ghost'` | 6000 | Drag previews above everything. |

Gaps of 100 / 1000 between bands leave room for the numeric `zIndex` escape hatch to nudge a Surface within its band (e.g. `<Surface layer="modal" zIndex={3001}>` is a modal painting just above a peer modal).

## Examples

### Basic — paintable, layered rect

```tsx
<Surface layer="overlay" borderStyle="single" backgroundColor="#101820" padding={1}>
  <Text>panel contents</Text>
</Surface>
```

### Modal dialog with backdrop

```tsx
<Surface
  position="absolute"
  top={5} left={10}
  width={60} height={20}
  layer="modal"
  borderStyle="round" borderColor="#444"
  backgroundColor="#101820"
  padding={1}
  elevation={3}
  hitTestBoundary
  backdrop
  backdropColor="#000"
  onClick={() => closeModal()}
>
  <Text bold>Confirm</Text>
  <Text>Are you sure?</Text>
</Surface>
```

The backdrop is auto-rendered as a sibling Box behind the Surface, layered at `z = 3000 - 1 = 2999`. Clicks anywhere on the Surface fire `onClick`; lower-z siblings beneath the modal's rect can't receive events.

### Drag ghost (transient overlay above everything)

```tsx
<Surface
  position="absolute"
  top={cursorY} left={cursorX}
  layer="drag-ghost"
  elevation={1}
  backgroundColor="#1e293b"
  borderStyle="single"
  borderColor="#7dd3fc"
>
  <Text>{draggedItem.name}</Text>
</Surface>
```

`layer='drag-ghost'` paints above every other Surface band, so the ghost is always visible.

## Behavior notes

- **Default Surface is byte-identical to Box.** A `<Surface>` with no `layer`, no `zIndex`, no surface-specific flags emits an `ink-box` with the same style and no host attributes — swapping `<Box>` → `<Surface>` is safe across the existing codebase.
- **Layer applies only to absolute Surfaces.** The renderer ignores `zIndex` on in-flow / relative nodes; Surface follows that rule. A relative Surface with `layer='modal'` paints in-flow as if no layer were set (no warning fires for this case because the default `'base'` is harmless).
- **`hitTestBoundary` / `elevation` / `backdrop` require absolute positioning.** Setting any of these on a relative Surface emits a dev warning (`logForDebugging` — no-op in production unless `DEBUG=1`) and the flag is silently ignored.
- **`clip='hidden'` defers to `overflow`.** If you set both `clip` and an explicit `overflow` / `overflowX` / `overflowY` prop, the explicit overflow wins.
- **Backdrop layering.** The scrim is `(resolvedZ - 1)`. A peer modal opened on top — say a confirm dialog inside the existing modal — gets its OWN backdrop sandwiched at `(peerZ - 1)`, so the two modals stack correctly with their own scrims.

## Related
- [Box](box.md) — Surface delegates style passthrough to ink-box; everything Box accepts, Surface accepts.
- [Draggable](draggable.md), [Resizable](resizable.md) — both paint through Surface internally.
- [Internals: Surface](../internals/surface.md) — renderer touches (hit-test boundary, elevation paint, backdrop), design rationale, layer band history.
