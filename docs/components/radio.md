# Radio

Focusable mutually-exclusive selection bound to a value. Renders `(x)` / `( )` plus an optional label.

## Import
```tsx
import { Radio } from '@yokai-tui/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `current` | `T` | — | Currently selected value across the radio group. Caller-controlled (typically a `useState<T>` shared by every radio in the group). |
| `value` | `T` | — | This radio's value. Selected iff `value === current`. |
| `onChange` | `(value: T) => void` | — | Called when the user activates this radio. Always fires with this radio's `value`. |
| `label` | `string` | — | Label rendered next to the radio. Optional. |
| `focusColor` | `Color` | `'cyan'` | Text color while focused. |
| `autoFocus` | `boolean` | `false` | Focus on mount. |

Generic-typed in `T` — value can be a string union, boolean, enum, or arbitrary primitive. All `<Box>` props are accepted except `onClick` and `onKeyDown`. `claimFocusOnClick` defaults to `false`; see Behavior.

## Examples

### Three-option group
```tsx
type Size = 'sm' | 'md' | 'lg'
const [size, setSize] = useState<Size>('md')

<FocusGroup direction="row">
  <Radio current={size} value="sm" onChange={setSize} label="small" paddingX={1} />
  <Radio current={size} value="md" onChange={setSize} label="medium" paddingX={1} />
  <Radio current={size} value="lg" onChange={setSize} label="large" paddingX={1} />
</FocusGroup>
```

### Boolean yes/no
```tsx
const [enabled, setEnabled] = useState(false)
<FocusGroup direction="row">
  <Radio current={enabled} value={true} onChange={setEnabled} label="yes" />
  <Radio current={enabled} value={false} onChange={setEnabled} label="no" />
</FocusGroup>
```

### Color picker with swatches via children
```tsx
<Radio current={color} value="red" onChange={setColor}>
  <Text color="red"> ■ red</Text>
</Radio>
```

## Behavior

- **No-click-focus default.** Same as `<Checkbox>` — clicking a Radio toggles selection but doesn't tear focus from a peer (e.g. a `<TextInput>` showing a live preview). Tab still focuses normally.
- **Activation is idempotent.** Clicking an already-selected Radio fires `onChange(value)` again. Caller's setState is a no-op for unchanged values; this matches HTML radio semantics — there's no "uncheck" gesture, since you'd be left with no selected value. To clear a group, set `current` to a value none of the radios match.
- **Keyboard:** Enter and Space activate the focused Radio. Tab / Shift+Tab moves between groups; use `<FocusGroup>` for arrow-key navigation within a group.
- **Visual:** `(x)` selected, `( )` unselected. Parens distinguish radios from checkboxes (`[x]` / `[ ]`) at-a-glance.

## Related
- [`Checkbox`](./checkbox.md) — boolean toggle sibling
- [`FocusGroup`](./focus-group.md)
- [`useFocus`](../hooks/use-focus.md)

## Source
[`packages/renderer/src/components/Radio.tsx`](../../packages/renderer/src/components/Radio.tsx)
