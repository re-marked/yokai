# FocusRing

Focusable Box with a built-in focus-visible border indicator.

## Import
```tsx
import { FocusRing } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `borderColorFocus` | `Color` | `'cyan'` | Border color when the element is focused. |
| `borderColorIdle` | `Color` | `undefined` | Border color when not focused (terminal default when undefined). |
| `autoFocus` | `boolean` | — | Auto-focus this element on mount. Same semantics as `useFocus`. |

All `<Box>` props are accepted except `ref` (used internally). `tabIndex` defaults to `0`; `borderStyle` defaults to `'single'`. Both can be overridden via Box props. See [box.md](./box.md).

## Examples
### List of focusable rows
```tsx
<FocusGroup direction="column">
  {items.map((item) => (
    <FocusRing key={item.id} paddingX={1}>
      <Text>{item.label}</Text>
    </FocusRing>
  ))}
</FocusGroup>
```

## Behavior
- Subscribes to focus via `useFocus({ autoFocus })` — pay for the focus subscription only when chrome is wanted.
- Renders a `borderStyle: 'single'` box and swaps `borderColor` between idle and focus colors based on `isFocused`.
- User-supplied `borderStyle` (e.g. `'double'`, `'round'`, `'bold'`) wins over the default via the boxProps spread.
- `tabIndex` is set to `0` unless overridden, so the element is keyboard-reachable.

## Related
- [`FocusGroup`](./focus-group.md)
- [`useFocus`](../hooks/use-focus.md)
- [`Box`](./box.md)

## Source
[`packages/renderer/src/components/FocusRing.tsx`](../../packages/renderer/src/components/FocusRing.tsx)
