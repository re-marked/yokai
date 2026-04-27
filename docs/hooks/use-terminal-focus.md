# useTerminalFocus

Report whether the terminal window itself currently has focus.

## Import
```tsx
import { useTerminalFocus } from '@yokai/renderer'
```

## Signature
```tsx
function useTerminalFocus(): boolean
```

Driven by DECSET 1004 focus reporting — the terminal emits `\x1b[I` on focus-in and `\x1b[O` on focus-out. Yokai enables tracking on mount, parses the sequences, and filters them out of `useInput`. Returns `true` when focused or when the terminal hasn't reported a state yet.

## Returns
| Type | Description |
|------|-------------|
| `boolean` | `true` if the terminal is focused (or focus state is unknown), `false` after a focus-out report. |

## Examples
### Dim UI while window is unfocused
```tsx
const focused = useTerminalFocus()
return <Text dimColor={!focused}>{label}</Text>
```

### Pause polling on blur
```tsx
const focused = useTerminalFocus()
useEffect(() => {
  if (!focused) return
  const id = setInterval(refresh, 1000)
  return () => clearInterval(id)
}, [focused])
```

## When to use
Power-saving idle behavior, dimming, or pausing background work when the user switches windows. Distinct from `useFocus`, which tracks per-element focus inside the app.

## Related
- [`useFocus`](./use-focus.md) — element-level focus.

## Source
[`packages/renderer/src/hooks/use-terminal-focus.ts`](../../packages/renderer/src/hooks/use-terminal-focus.ts)
