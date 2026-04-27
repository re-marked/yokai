# FocusGroup

Wraps a `<Box>` and adds arrow-key navigation between focusable descendants.

## Import
```tsx
import { FocusGroup } from '@yokai/renderer'
import type { FocusGroupDirection } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `direction` | `'row' \| 'column' \| 'both'` | `'column'` | Which arrow keys traverse focus. `'row'` uses ←/→, `'column'` uses ↑/↓, `'both'` uses all four (linear order). |
| `wrap` | `boolean` | `false` | When true, pressing past the last/first focusable cycles to the other end. |
| `isActive` | `boolean` | `true` | When false, the group does not capture arrow keys. |

All `<Box>` props are accepted. See [box.md](./box.md).

## Examples
### Vertical menu with wrap
```tsx
<FocusGroup direction="column" wrap>
  {items.map((item) => (
    <Box key={item.id} tabIndex={0}>
      <Text>{item.label}</Text>
    </Box>
  ))}
</FocusGroup>
```

## Behavior
- Children opt in to focusability via `tabIndex={0}` on a `<Box>`, or via `useFocus()`.
- Arrows are bounded to this group: only act when the currently focused element is a descendant.
- Tab / Shift+Tab still cycle through ALL tabbables in the entire tree — arrows do not replace global tab order.
- Tab order = tree order, same walker `FocusManager.focusNext` uses.
- Wrap is per-group; each group decides independently whether to cycle at its boundaries.
- Arrows on the irrelevant axis pass through to other handlers.
- **Nested groups**: the innermost containing group acts; the outer group's descendant check also passes, so both move focus. Avoid overlapping arrow assignments — give the outer group a different `direction` axis from the inner one.

## Related
- [`FocusRing`](./focus-ring.md)
- [`useFocus`](../hooks/use-focus.md)
- [`useFocusManager`](../hooks/use-focus-manager.md)
- [`Box`](./box.md)

## Source
[`packages/renderer/src/components/FocusGroup.tsx`](../../packages/renderer/src/components/FocusGroup.tsx)
