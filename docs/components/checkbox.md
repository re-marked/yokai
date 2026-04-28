# Checkbox

Focusable boolean toggle. Renders `[x]` / `[ ]` plus an optional label, the whole row is the click target.

## Import
```tsx
import { Checkbox } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `checked` | `boolean` | — | Current checked state. Caller-controlled. |
| `onChange` | `(checked: boolean) => void` | — | Called on toggle (mouse-click, Enter, Space). |
| `label` | `string` | — | Label rendered next to the box. Optional. |
| `focusColor` | `Color` | `'cyan'` | Text color while focused. |
| `autoFocus` | `boolean` | `false` | Focus on mount. |

All `<Box>` props are accepted except `onClick` and `onKeyDown` (the component owns those). `tabIndex` defaults to `0` and can be overridden. `claimFocusOnClick` defaults to `false` (the headline of this primitive — see Behavior) and can be overridden to `true` for standard click-takes-focus behavior.

## Examples

### Basic toggle
```tsx
const [accepted, setAccepted] = useState(false)
<Checkbox checked={accepted} onChange={setAccepted} label="I accept the terms" />
```

### Live-bound config next to a TextInput
```tsx
const [bold, setBold] = useState(false)
const [value, setValue] = useState('')

<Box flexDirection="column" gap={1}>
  <Checkbox checked={bold} onChange={setBold} label="bold" />
  <TextInput value={value} onChange={setValue} />
</Box>
```
Clicking the checkbox toggles `bold` without tearing focus from the TextInput — the TextInput's cursor stays visible the whole time.

### Custom layout via children
```tsx
<Checkbox checked={enabled} onChange={setEnabled}>
  <Text> | </Text>
  <Text color="cyan">{enabled ? 'enabled' : 'disabled'}</Text>
</Checkbox>
```

## Behavior

- **No-click-focus default.** Mouse-clicking a Checkbox toggles state but does NOT move focus to it. The whole point: a Checkbox in a form next to a focused TextInput shouldn't tear focus away when the user clicks it. Tab navigation is unaffected — Checkbox still receives focus on Tab. To get the standard "click takes focus" behavior, pass `claimFocusOnClick={true}`.
- **Keyboard:** Enter and Space both toggle when keyboard-focused. Tab / Shift+Tab moves focus globally; pair with `<FocusGroup>` for arrow-key navigation across siblings.
- **Visual:** `[x]` checked, `[ ]` unchecked. Label and bracket color shift to `focusColor` (default cyan) and go bold while focused.
- **Click target:** the whole row, not just the bracket. Matches the HTML `<label>`-wraps-`<input>` convention.

## Related
- [`Radio`](./radio.md) — mutually-exclusive sibling
- [`FocusGroup`](./focus-group.md) — wrap a row/column for arrow-key navigation
- [`useFocus`](../hooks/use-focus.md)

## Source
[`packages/renderer/src/components/Checkbox.tsx`](../../packages/renderer/src/components/Checkbox.tsx)
