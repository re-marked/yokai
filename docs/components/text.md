# Text

Renders a styled text node — the only legal place to put string children in a yokai tree.

## Import
```tsx
import { Text } from '@yokai-tui/renderer'
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

## Known issue: nested-text + flex parent silent truncation

A `<Text>` containing other `<Text>` nodes inside a flex-row parent can render with trailing content silently truncated, even when the parent has plenty of available space.

Repro:

```tsx
<Box flexDirection="row" width="100%">
  <Box flexGrow={1} />
  <Box flexShrink={0}>
    <Text wrap="truncate">
      <Text bold>13:47:04</Text>
      <Text>{' · '}</Text>
      <Text>May 3</Text>
    </Text>
  </Box>
</Box>
```

Expected: `13:47:04 · May 3` flush against the right edge.
Actual: `13:47:04 · May…` (or `13:47:04 · May` with no signal) — even at full-screen widths where there's >100 cells of slack.

Root cause hypothesis (not fully confirmed): yoga's flex basis pass calls the outer `<Text>`'s `measureFunc` with an AtMost width that's narrower than the squashed natural width, and the returned wrapped/truncated dimensions become the node's basis for distribution. The wrapper Box's `flexShrink={0}` reserves the basis-width but the text inside is sized to that already-truncated value. The render-time per-text clamp is a red herring — it doesn't engage in this case.

Workarounds:

1. **Explicit `width` on the wrapper Box**, sized to the maximum natural width of the contents. Bypasses flex-distribution entirely:
   ```tsx
   <Box flexShrink={0} width={16}>
     <Text>{...nested...}</Text>
   </Box>
   ```

2. **Split the nested `<Text>` into sibling Texts** in the parent flex row, with `gap` for the visual spacing the inline separator was carrying. Each fragment claims its own natural width independently:
   ```tsx
   <Box flexDirection="row" gap={1}>
     <Text bold>13:47:04</Text>
     <Text>·</Text>
     <Text>May 3</Text>
   </Box>
   ```

3. **`justifyContent="flex-end"` on the parent** (drop the spacer Box) — no flex-distribute math, no overflow path.

Tracking issue: [yokai #51](https://github.com/re-marked/yokai/issues/51)

## Related
- [Box](box.md), [Link](link.md), [RawAnsi](raw-ansi.md)
- [Colors and styles](../concepts/colors.md)

## Source
[`packages/renderer/src/components/Text.tsx`](../../packages/renderer/src/components/Text.tsx)
