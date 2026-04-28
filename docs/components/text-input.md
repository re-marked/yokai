# TextInput

Editable text input. Single-line by default; pass `multiline` for newline-aware editing.

## Import
```tsx
import { TextInput } from '@yokai/renderer'
```

## Props

Component-specific props. All `<Box>` props are accepted EXCEPT `onKeyDown`, `onPaste`, `onMouseDown`, `onClick` (the input owns those).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | — | Controlled value. When set, the input mirrors this exact string and emits `onChange` on edits. |
| `defaultValue` | `string` | `''` | Initial value when uncontrolled. Ignored after mount. |
| `onChange` | `(value: string) => void` | — | Called on every buffer change (typing, paste, delete, undo, redo). |
| `onSubmit` | `(value: string) => void` | — | Called on Enter (single-line) or Ctrl+Enter (multiline). |
| `onCancel` | `() => void` | — | Called on Escape. |
| `multiline` | `boolean` | `false` | Allow newlines. Enter inserts `'\n'`; Ctrl+Enter submits. |
| `maxLength` | `number` | `Infinity` | Cap on buffer length in characters. Insertions truncate to fit. |
| `placeholder` | `string` | — | Dimmed text shown when the buffer is empty. |
| `password` | `boolean` | `false` | Replace rendered chars with `passwordChar`. Caret math uses the real buffer. |
| `passwordChar` | `string` | `'•'` | Mask character for `password` mode. |
| `disabled` | `boolean` | `false` | Ignore keystrokes. The input still claims focus. |
| `selectionColor` | `Color` | `'cyan'` | Background of the selection highlight. |
| `borderColorFocus` | `Color` | `'cyan'` | Border color while focused. Swaps `borderColor` on focus, reverts on blur. No-op when no `borderStyle` is set. To opt out, pass the same value as `borderColor`. |
| `autoFocus` | `boolean` | `false` | Focus on mount. |
| `historyCap` | `number` | `100` | Max undo entries. Older entries drop. |

## Examples

### Single-line, controlled
```tsx
const [name, setName] = useState('')
<TextInput
  value={name}
  onChange={setName}
  placeholder="Type your name…"
  onSubmit={(v) => console.log('submitted', v)}
/>
```

### Multiline
```tsx
<TextInput
  defaultValue=""
  multiline
  height={6}
  onSubmit={(v) => save(v)} // Ctrl+Enter
/>
```

### Password
```tsx
<TextInput value={pw} onChange={setPw} password />
```

### Custom focus color
```tsx
<TextInput
  value={query}
  onChange={setQuery}
  borderStyle="round"
  borderColor="gray"      // idle
  borderColorFocus="green" // focused
/>
```

### Disable focus chrome (use a sibling indicator instead)
```tsx
<TextInput
  value={x}
  onChange={setX}
  borderStyle="round"
  borderColor="gray"
  borderColorFocus="gray" // same as idle → no swap
/>
```

## Key bindings

| Action | Single-line | Multiline |
|--------|-------------|-----------|
| Insert char | Type | Type |
| Insert newline | — | Enter |
| Submit | Enter | Ctrl+Enter |
| Cancel | Escape | Escape |
| Delete back | Backspace | Backspace |
| Delete forward | Delete | Delete |
| Delete word back | Ctrl+Backspace, Ctrl+W | same |
| Delete to line start | Ctrl+U | same |
| Delete to line end | Ctrl+K | same |
| Move char | ←/→ | ←/→ |
| Move line | — | ↑/↓ |
| Move word | Ctrl+←/→ | same |
| Move to line edge | Home / End | same |
| Move to doc edge | Ctrl+Home / Ctrl+End | same |
| Extend selection | Shift + any movement | same |
| Select all | Ctrl+A | same |
| Undo | Ctrl+Z | same |
| Redo | Ctrl+Y, Ctrl+Shift+Z | same |

## Behavior

- **Controlled vs uncontrolled.** Pass `value` for controlled mode (parent owns the buffer); pass `defaultValue` for uncontrolled (the input owns it). External `value` changes reset internal state — undo across an external set isn't a useful semantic.
- **Caret rendering.** The real terminal cursor is positioned at the caret via `useDeclaredCursor`, so IME composition popups and screen readers follow correctly. No synthetic glyph.
- **Smart paste.** Short pastes (≤ `<AlternateScreen pasteThreshold>`, default 32 chars) come through as a stream of keystrokes — they feel like typing. Longer pastes fire `onPaste` and become one undo step.
- **Single-line + newlines.** Pasting multiline content into a single-line input converts newlines to spaces (the alternative — silently dropping them — would corrupt the user's intent).
- **Undo grouping.** Consecutive same-kind insertions or deletions merge into one undo step (a typed word is one Ctrl+Z, not N). Pastes are always their own step.
- **Wide chars.** Caret math counts CJK / wide chars as 2 cells, combining marks as 0. Click positioning snaps to the LEFT edge of a wide char if the click lands mid-glyph.

## Scrolling

- **Single-line**: when content exceeds the box width, the visible window scrolls horizontally so the caret stays in view. Wide chars at the visible edges render as spaces to keep cell layout stable; selection highlight on a horizontally-scrolled wide char is rendered approximately.
- **Multiline**: when content exceeds the box height, the visible window scrolls vertically so the caret line stays in view. Each visible line truncates if it exceeds the inner width.
- The inner content area is read from yoga's computed size minus padding + border, so `width` / `height` props refer to the OUTER box. If you don't pass `width` / `height`, no scrolling — content fills the box's natural size.

## Known limitations

- IME composition is not yet handled — multi-byte composition sequences from CJK / Korean IMEs may produce intermediate state. Committed text works correctly.
- Selection highlight may render approximately when it crosses a horizontally-scrolled wide character boundary.
- Click positioning doesn't subtract padding/border from the click coordinates — clicks within padding may snap to the wrong char by the padding amount.

## Related
- [Keyboard concept](../concepts/keyboard.md)
- [Smart paste in events.md](../concepts/events.md)
- [`<FocusGroup>`](focus-group.md) — wrap a form in one for Tab navigation between TextInputs

## Source
[`packages/renderer/src/components/TextInput/`](../../packages/renderer/src/components/TextInput/)
