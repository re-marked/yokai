# useInput

Subscribe to keyboard input with parsed key flags and the raw input string.

## Import
```tsx
import { useInput } from '@yokai/renderer'
```

## Signature
```tsx
function useInput(
  handler: (input: string, key: Key, event: InputEvent) => void,
  options?: { isActive?: boolean },
): void
```

Enables raw mode on mount via `useLayoutEffect` and disables it on unmount. Pasted text arrives as a single `input` string, not character-by-character.

## Options
| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `isActive` | `boolean` | `true` | Suspend the handler without unmounting. Useful when several `useInput` hooks coexist and only one should consume at a time. |

## Handler arguments
| Field | Type | Description |
|-------|------|-------------|
| `input` | `string` | Printable text. Empty for non-alphanumeric keys (arrows, F-keys). For `ctrl`+letter, the lowercase name; for paste, the entire chunk. |
| `key` | `Key` | Flags for special keys and modifiers. |
| `event` | `InputEvent` | Underlying event; supports `stopImmediatePropagation()` and exposes the parsed `keypress`. |

## Key flags
`upArrow`, `downArrow`, `leftArrow`, `rightArrow`, `pageUp`, `pageDown`, `wheelUp`, `wheelDown`, `home`, `end`, `return`, `escape`, `tab`, `backspace`, `delete`, `ctrl`, `shift`, `meta`, `super`, `fn` — all `boolean`.

`shift` is also set automatically for uppercase A–Z. `super` only arrives via Kitty CSI u sequences (Cmd / Win key).

## Examples
### Basic
```tsx
useInput((input, key) => {
  if (key.escape) onCancel()
  else if (key.return) onSubmit()
  else if (input === 'q') exit()
})
```

### Conditional capture
```tsx
const { isFocused } = useFocus()
useInput((_, key) => {
  if (key.upArrow) move(-1)
  if (key.downArrow) move(1)
}, { isActive: isFocused })
```

### Stop propagation
```tsx
useInput((input, key, event) => {
  if (key.ctrl && input === 'k') {
    openPalette()
    event.stopImmediatePropagation()
  }
})
```

## When to use
The default keyboard primitive. Reach for `useStdin` only when raw stream access or terminal querying is needed.

## Related
- [`useFocus`](./use-focus.md) — gate input on element focus.
- [`useStdin`](./use-stdin.md) — lower-level stream access.

## Source
[`packages/renderer/src/hooks/use-input.ts`](../../packages/renderer/src/hooks/use-input.ts)
