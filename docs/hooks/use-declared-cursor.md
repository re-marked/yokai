# useDeclaredCursor

Declares where the renderer should park the terminal cursor after each frame.

## Import
```tsx
import { useDeclaredCursor } from '@yokai/renderer'
```

## Signature
```tsx
function useDeclaredCursor(opts: {
  line: number
  column: number
  active: boolean
}): (element: DOMElement | null) => void
```

## Parameters
| Field | Type | Description |
|-------|------|-------------|
| `line` | `number` | Row offset (relative to the attached node's rect). |
| `column` | `number` | Column offset (relative to the attached node's rect). |
| `active` | `boolean` | When `true`, declares the cursor every commit. When `false`, clears only if this instance currently owns the declaration. |

## Returns
| Type | Description |
|------|-------------|
| `(el: DOMElement \| null) => void` | Ref callback. Attach to the `Box` containing the input. |

Declared `(line, column)` is interpreted relative to the attached Box's rect (populated by `renderNodeToOutput`). The renderer reads the declaration during the post-commit microtask so the first frame is correct (no one-keystroke lag).

The inactive-clear path checks node identity to avoid two hazards: (1) a memoized active sibling that didn't re-render this commit being clobbered by an inactive instance, and (2) sibling focus handoff where the new-active set runs before the old-active cleanup. Unmount cleanup is also conditional.

## Why declare cursor position
- Terminal emulators render IME preedit text at the physical cursor position — declaring keeps CJK input inline with the caret.
- Screen readers and screen magnifiers track the native cursor.

## Example
```tsx
function TextInput({ value, caret, focused }: Props) {
  const ref = useDeclaredCursor({ line: 0, column: caret, active: focused })
  return <Box ref={ref}><Text>{value}</Text></Box>
}
```

## When to use
- Any focused text-entry component.
- Any element that should advertise a logical cursor position to assistive tooling.

## Related
- `CursorDeclarationContext`
- `renderNodeToOutput` — populates the rect read by the declaration

## Source
[`packages/renderer/src/hooks/use-declared-cursor.ts`](../../packages/renderer/src/hooks/use-declared-cursor.ts)
