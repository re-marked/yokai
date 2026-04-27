# Text

Renders a styled text node — the only legal place to put string children in a yokai tree.

## Import
```tsx
import { Text } from '@yokai/renderer'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `color` | `Color` (rgb / hex / ansi name) | — | Foreground color |
| `backgroundColor` | `Color` | — | Background color |
| `bold` | `boolean` | — | Bold weight (mutually exclusive with `dim`) |
| `dim` | `boolean` | — | Dim weight (mutually exclusive with `bold`) |
| `italic` | `boolean` | `false` | Italic |
| `underline` | `boolean` | `false` | Underline |
| `strikethrough` | `boolean` | `false` | Strikethrough |
| `inverse` | `boolean` | `false` | Swap fg/bg |
| `wrap` | `'wrap' \| 'wrap-trim' \| 'end' \| 'middle' \| 'truncate' \| 'truncate-end' \| 'truncate-middle' \| 'truncate-start'` | `'wrap'` | Overflow strategy when content exceeds container width |
| `children` | `ReactNode` | — | String / number content |

## Examples

### Basic
```tsx
<Text color="cyan" bold>hello</Text>
```

### Truncation
```tsx
<Box width={20}>
  <Text wrap="truncate-middle">a very long string that will be cut</Text>
</Box>
```

### Nested styles
```tsx
<Text color="white">
  <Text color="red" bold>error: </Text>
  something failed
</Text>
```

## Behavior

- String / number children may only appear inside `<Text>`; the reconciler rejects them elsewhere.
- `bold` and `dim` are mutually exclusive at the type level (terminals cannot render both).
- `wrap` modes prefixed `truncate-*` produce a single line; `wrap` / `wrap-trim` / `end` / `middle` allow multiple lines.
- The TypeScript type `WeightProps` enforces the bold/dim exclusion — passing both is a compile error.
- Returns `null` when `children` is `undefined` or `null` (no empty span emitted).
- Embedded ANSI escape sequences in children are parsed and merged with the surrounding style stack at render time.
- A `<Text>` itself acts as a flex row leaf; nested `<Text>` inherits color/style from ancestors unless overridden.

## Related
- [Box](box.md), [Link](link.md), [RawAnsi](raw-ansi.md)
- [Colors and styles](../concepts/colors.md)

## Source
[`packages/renderer/src/components/Text.tsx`](../../packages/renderer/src/components/Text.tsx)
