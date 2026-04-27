# useFocusManager

Reactive access to the global FocusManager.

## Import
```tsx
import { useFocusManager } from '@yokai/renderer'
```

## Signature
```tsx
function useFocusManager(): {
  focused: DOMElement | null
  focus: (node: DOMElement | null) => void
  focusNext: () => void
  focusPrevious: () => void
  blur: () => void
}
```

Subscribes to global focus changes; consumers re-render whenever the active element changes anywhere in the tree. Outside `FocusContext`, all actions are no-ops and `focused` stays `null` — degrades silently, no throws.

## Returns
| Field | Type | Description |
|-------|------|-------------|
| `focused` | `DOMElement \| null` | Currently focused node, or `null`. Reactive. |
| `focus` | `(node: DOMElement \| null) => void` | Imperatively focus a node (typically a ref's `.current`). No-op for `null` or outside context. |
| `focusNext` | `() => void` | Advance to the next element in tab order. Wraps. Same behavior as `Tab`. |
| `focusPrevious` | `() => void` | Move to the previous element in tab order. Wraps. Same behavior as `Shift+Tab`. |
| `blur` | `() => void` | Clear focus entirely. |

## Examples
### Status bar showing active element
```tsx
const { focused } = useFocusManager()
return <Text>focus: {focused?.attributes.label ?? 'none'}</Text>
```

### Modal pulls focus on open
```tsx
const { focus, blur } = useFocusManager()
const inputRef = useRef<DOMElement>(null)
useEffect(() => {
  focus(inputRef.current)
  return () => blur()
}, [])
```

### Programmatic Tab cycling
```tsx
const { focusNext, focusPrevious } = useFocusManager()
useInput((_, key) => {
  if (key.tab && !key.shift) focusNext()
  if (key.tab && key.shift) focusPrevious()
})
```

## When to use
Components that need to know about *global* focus or drive focus across the tree — status bars, modals, custom Tab handlers. For tracking a single element's own focus, prefer [`useFocus`](./use-focus.md): it subscribes only to one node's transitions and pairs with `tabIndex` on a single Box.

## Related
- [`useFocus`](./use-focus.md) — per-element focus tracking.

## Source
[`packages/renderer/src/hooks/use-focus-manager.ts`](../../packages/renderer/src/hooks/use-focus-manager.ts)
