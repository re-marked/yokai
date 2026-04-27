# NoSelect

Marks a region as non-selectable so fullscreen text selection skips its cells.

## Import
```tsx
import { NoSelect } from '@yokai/renderer'
```

## Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `fromLeftEdge` | `boolean` | `false` | Extend the exclusion zone from column 0 to this box's right edge for every row it occupies. |

All `<Box>` props are accepted except `noSelect` (set internally). See [box.md](./box.md).

## Examples
### Gutter exclusion
```tsx
<Box flexDirection="row">
  <NoSelect fromLeftEdge><Text dimColor> 42 +</Text></NoSelect>
  <Text>const x = 1</Text>
</Box>
```

## Behavior
- Cells inside are skipped by both the selection highlight and the copied text.
- Only affects alt-screen text selection (`<AlternateScreen>` with mouse tracking). No-op in main-screen scrollback render where the terminal's native selection is used.
- `fromLeftEdge` is for gutters rendered inside a wider indented container — without it, a multi-row drag picks up the container's leading indent on rows below the prefix.

## Related
- [`AlternateScreen`](./alternate-screen.md)
- [`Box`](./box.md)

## Source
[`packages/renderer/src/components/NoSelect.tsx`](../../packages/renderer/src/components/NoSelect.tsx)
