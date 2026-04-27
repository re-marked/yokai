# Box

The fundamental layout primitive — a Yoga flexbox container with focus and pointer event handling.

## Import
```tsx
import { Box } from '@yokai/renderer'
```

## Props

Layout props (all Yoga flexbox properties: `width`, `height`, `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `flexWrap`, `justifyContent`, `alignItems`, `alignSelf`, `gap`, `rowGap`, `columnGap`, `margin*`, `padding*`, `borderStyle`, `borderColor`, `position`, `top`/`right`/`bottom`/`left`, `display`, `overflow`/`overflowX`/`overflowY`, `zIndex`) are accepted directly. See [layout concepts](../concepts/layout.md).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `flexDirection` | `'row' \| 'column' \| ...` | `'row'` | Main axis direction |
| `flexGrow` | `number` | `0` | Yoga flex-grow |
| `flexShrink` | `number` | `1` | Yoga flex-shrink |
| `flexWrap` | `'nowrap' \| 'wrap' \| 'wrap-reverse'` | `'nowrap'` | Wrap behavior |
| `tabIndex` | `number` | — | `>= 0` joins Tab cycle; `-1` is programmatically focusable only |
| `autoFocus` | `boolean` | — | Focus on mount (during reconciler `commitMount`) |
| `ref` | `Ref<DOMElement>` | — | DOM-element ref |
| `onClick` | `(e: ClickEvent) => void` | — | Left-button click; bubbles |
| `onMouseDown` | `(e: MouseDownEvent) => void` | — | Left-button press; supports `e.captureGesture(...)` for drag |
| `onMouseEnter` | `() => void` | — | Pointer entered rect; does not bubble |
| `onMouseLeave` | `() => void` | — | Pointer left rect |
| `onFocus` | `(e: FocusEvent) => void` | — | Focus received |
| `onFocusCapture` | `(e: FocusEvent) => void` | — | Capture-phase focus |
| `onBlur` | `(e: FocusEvent) => void` | — | Focus lost |
| `onBlurCapture` | `(e: FocusEvent) => void` | — | Capture-phase blur |
| `onKeyDown` | `(e: KeyboardEvent) => void` | — | Key pressed while focused |
| `onKeyDownCapture` | `(e: KeyboardEvent) => void` | — | Capture-phase keydown |

## Examples

### Basic
```tsx
<Box flexDirection="column" padding={1} borderStyle="round">
  <Text>line one</Text>
  <Text>line two</Text>
</Box>
```

### Focusable with click handler
```tsx
<Box
  tabIndex={0}
  onClick={(e) => console.log('clicked', e)}
  onKeyDown={(e) => e.key === 'return' && submit()}
  borderStyle="single"
  padding={1}
>
  <Text>activate me</Text>
</Box>
```

### Drag gesture
```tsx
<Box
  onMouseDown={(e) => {
    e.captureGesture({
      onMove: (m) => setPos({ x: m.x, y: m.y }),
      onUp: () => save(),
    })
  }}
>
  <Text>drag handle</Text>
</Box>
```

## Behavior

- All spacing values must be integers; non-integer `margin`/`padding`/`gap` triggers a dev warning.
- Pointer events (`onClick`, `onMouseDown`, `onMouseEnter`, `onMouseLeave`) only fire inside `<AlternateScreen>` with mouse tracking enabled.
- `onClick` and `onMouseDown` bubble; call `event.stopImmediatePropagation()` to halt.
- `onMouseEnter` / `onMouseLeave` do not bubble — moving between children does not re-fire on the parent.
- `zIndex` only applies to nodes with `position: 'absolute'`; it is silently ignored on in-flow children (a dev-mode warning fires). Stacking is flat per parent — siblings sort against each other, not against arbitrarily distant cousins.
- Inside an `onMouseDown` handler, calling `event.captureGesture({ onMove, onUp })` claims subsequent motion and the release for that drag, suppressing selection extension.
- `overflowX` and `overflowY` fall back to `overflow` if unset, then to `'visible'`.

## Related
- [Text](text.md), [ScrollBox](scrollbox.md), [Button](button.md)
- [Layout concepts](../concepts/layout.md)
- [Focus](../concepts/focus.md), [Mouse events](../concepts/mouse.md)

## Source
[`packages/renderer/src/components/Box.tsx`](../../packages/renderer/src/components/Box.tsx)
