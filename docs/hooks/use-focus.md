# useFocus

Track focus state for a single element and expose imperative focus.

## Import
```tsx
import { useFocus } from '@yokai/renderer'
```

## Signature
```tsx
function useFocus(options?: { autoFocus?: boolean }): {
  ref: { current: DOMElement | null }
  isFocused: boolean
  focus: () => void
}
```

Pair with `tabIndex={0}` on the rendered Box — the hook does not inject the prop. Outside `FocusContext` (e.g. unit-test render bypassing `<App>`), `focus()` is a no-op and `isFocused` stays `false`.

## Options
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `autoFocus` | `boolean` | `false` | Focus this element once on mount. Equivalent to `<Box autoFocus>`. Does not re-fire on prop changes. |

## Returns
| Field | Type | Description |
|-------|------|-------------|
| `ref` | `RefObject<DOMElement \| null>` | Attach to the focusable Box. |
| `isFocused` | `boolean` | `true` when the attached element is the active focus target. |
| `focus` | `() => void` | Imperatively focus the element. No-op if not yet mounted or outside `FocusContext`. |

## Examples
### Focus-aware menu item
```tsx
function MenuItem({ label }: { label: string }) {
  const { ref, isFocused } = useFocus()
  return (
    <Box ref={ref} tabIndex={0} backgroundColor={isFocused ? 'cyan' : undefined}>
      <Text>{label}</Text>
    </Box>
  )
}
```

### Auto-focus first field
```tsx
const { ref } = useFocus({ autoFocus: true })
return <Box ref={ref} tabIndex={0}><TextInput /></Box>
```

### Programmatic focus
```tsx
const { ref, focus } = useFocus()
useInput((input) => { if (input === '/') focus() })
return <Box ref={ref} tabIndex={0}><SearchBar /></Box>
```

## When to use
Per-element focus tracking — the common case. For global focus state or programmatic Tab cycling across the tree, use [`useFocusManager`](./use-focus-manager.md).

## Related
- [`useFocusManager`](./use-focus-manager.md) — global focus actions.
- [`useInput`](./use-input.md) — gate input on `isFocused`.

## Source
[`packages/renderer/src/hooks/use-focus.ts`](../../packages/renderer/src/hooks/use-focus.ts)
