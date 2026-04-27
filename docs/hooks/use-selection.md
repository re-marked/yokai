# useSelection

Imperative access to text-selection state on the active Ink instance, plus a reactive helper for selection presence.

## Import
```tsx
import { useSelection, useHasSelection } from '@yokai/renderer'
```

Selection is only available in fullscreen / alt-screen mode. Outside of it, every operation is a no-op and `useHasSelection` is always `false`.

## useSelection

### Signature
```tsx
function useSelection(): SelectionApi
```

### Returns
| Field | Type | Description |
|-------|------|-------------|
| `copySelection` | `() => string` | Return selected text and clear the highlight. |
| `copySelectionNoClear` | `() => string` | Return selected text without clearing (copy-on-select). |
| `clearSelection` | `() => void` | Clear the highlight. |
| `hasSelection` | `() => boolean` | Imperative read. Use `useHasSelection` for reactive reads. |
| `getState` | `() => SelectionState \| null` | Raw mutable selection state (for drag-to-scroll). |
| `subscribe` | `(cb: () => void) => () => void` | Subscribe to start/update/finish/clear events. |
| `shiftAnchor` | `(dRow, minRow, maxRow) => void` | Shift only the anchor row, clamped. |
| `shiftSelection` | `(dRow, minRow, maxRow) => void` | Shift anchor and focus together (keyboard scroll). Clamped points get column reset to the full-width edge; relies on `captureScrolledRows` for the captured content. |
| `moveFocus` | `(move: FocusMove) => void` | Keyboard selection extension (shift+arrow). Left/right wrap rows; up/down clamp at viewport edges. |
| `captureScrolledRows` | `(firstRow, lastRow, side: 'above' \| 'below') => void` | Capture text from rows about to scroll out. Call **before** `scrollBy`. |
| `setSelectionBgColor` | `(color: string) => void` | Set the highlight background. Solid bg replaces SGR-7 inverse so syntax stays readable. Call on mount and on theme change. |

The returned object is memoized on the singleton Ink instance, so it is stable across renders and safe in dependency arrays.

### Example
```tsx
function CopyButton() {
  const sel = useSelection()
  return <Box onClick={() => clipboard.write(sel.copySelection())}>copy</Box>
}
```

## useHasSelection

### Signature
```tsx
function useHasSelection(): boolean
```

Reactive selection-exists state via `useSyncExternalStore`. Re-renders on create/clear.

### Example
```tsx
function StatusBar() {
  const hasSel = useHasSelection()
  return <Text>{hasSel ? 'press y to copy' : 'ready'}</Text>
}
```

## When to use
- `useHasSelection` to drive UI off the presence of a selection.
- `useSelection` for keyboard-driven selection, copy actions, drag-to-scroll, or theming the highlight.

## Related
- `selection.ts` — state machine and `FocusMove` / `SelectionState` types
- `AlternateScreen`
- `ScrollBox`

## Source
[`packages/renderer/src/hooks/use-selection.ts`](../../packages/renderer/src/hooks/use-selection.ts)
