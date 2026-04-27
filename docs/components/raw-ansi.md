# RawAnsi

Emits pre-rendered, pre-wrapped ANSI lines as a single Yoga leaf — bypasses the React-tree / per-span layout roundtrip.

## Import
```tsx
import { RawAnsi } from '@yokai/renderer'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `lines` | `string[]` | — | Pre-wrapped ANSI lines; each element must be exactly one terminal row |
| `width` | `number` | — | Column width the producer wrapped to; sent to Yoga as the leaf's fixed width |

## Examples

### Basic
```tsx
const lines = ansiHighlight(diffText, { width: 80 })
<RawAnsi lines={lines} width={80} />
```

### Inside a scroll viewport
```tsx
<ScrollBox height={20} flexDirection="column">
  <RawAnsi lines={renderedTranscript} width={cols} />
</ScrollBox>
```

## Behavior

- A single Yoga leaf with a constant-time measure function (`width × lines.length`); no per-span flex layout.
- The joined string is handed straight to `output.write()`, which splits on `\n` and parses ANSI into the screen buffer.
- Returns `null` when `lines` is empty.
- The producer is responsible for wrapping each line to exactly `width` columns; mis-sized lines will misrender (over- or under-fill).
- Use this for content already in terminal-ready form: external highlighters (e.g. NAPI ColorDiff), cached transcripts, syntax-highlighted diffs in long scroll views.
- Use `<Text>` instead when you want yokai to perform wrapping, style merging, or selection / hover hit-testing.
- Selection hit-testing treats the block as one opaque region — fine-grained per-character selection inside the block is not supported.

## Related
- [Text](text.md), [ScrollBox](scrollbox.md)
- [Performance: bypassing the React tree](../concepts/performance.md)

## Source
[`packages/renderer/src/components/RawAnsi.tsx`](../../packages/renderer/src/components/RawAnsi.tsx)
