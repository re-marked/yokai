# Button

A focusable `<Box>` that fires `onAction` on Enter, Space, or click and exposes focus / hover / active state to children via render prop.

## Import
```tsx
import { Button, type ButtonState } from '@yokai/renderer'
```

## Props

All `<Box>` style props are accepted (see [Box](box.md)) except `textWrap`.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `onAction` | `() => void` | — | Fired on Enter, Space, or left click |
| `tabIndex` | `number` | `0` | In tab order by default; pass `-1` for programmatic focus only |
| `autoFocus` | `boolean` | — | Focus on mount |
| `ref` | `Ref<DOMElement>` | — | Underlying box ref |
| `children` | `ReactNode \| (state: ButtonState) => ReactNode` | — | Static content, or render prop receiving `{ focused, hovered, active }` |

`ButtonState`:
```ts
type ButtonState = { focused: boolean; hovered: boolean; active: boolean }
```

## Examples

### Static content
```tsx
<Button onAction={() => save()} borderStyle="round" paddingX={1}>
  <Text>Save</Text>
</Button>
```

### State-driven styling
```tsx
<Button onAction={submit}>
  {({ focused, active }) => (
    <Box
      borderStyle={focused ? 'double' : 'single'}
      backgroundColor={active ? 'cyan' : undefined}
      paddingX={1}
    >
      <Text bold={focused}>OK</Text>
    </Box>
  )}
</Button>
```

## Behavior

- Intentionally unstyled — composition via the render-prop pattern is the supported way to skin buttons.
- `active` flips to `true` on Enter / Space activation and auto-clears 100ms later (a flash effect). Click activation does not set `active`.
- `hovered` tracks `onMouseEnter` / `onMouseLeave`; only effective inside `<AlternateScreen>` with mouse tracking.
- `focused` follows `onFocus` / `onBlur` events from the focus manager.
- The active-state timer is cleared on unmount to avoid setting state on an unmounted component.
- Keydown handler calls `e.preventDefault()` on Enter / Space so other handlers further up the tree do not also act.

## Related
- [Box](box.md), [FocusGroup](focus-group.md), [FocusRing](focus-ring.md)
- [`useFocus`](../hooks/use-focus.md), [`useFocusManager`](../hooks/use-focus-manager.md)

## Source
[`packages/renderer/src/components/Button.tsx`](../../packages/renderer/src/components/Button.tsx)
