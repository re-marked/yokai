# Indicators

Spinners and progress bars built on `useAnimationFrame`. Reach for these when work is in flight: loading states, file transfers, agent runs, build pipelines.

## Spinner

A rotating glyph cycling through a fixed frame set.

```tsx
import { Box, Text, render, useAnimationFrame } from '@yokai/renderer'
import type React from 'react'

const FRAMES = ['⠋', '⠙', '⠹', '⠸']

function Spinner({ label }: { label: string }): React.ReactNode {
  const [ref, time] = useAnimationFrame(80)
  const frame = Math.floor(time / 80) % FRAMES.length

  return (
    <Box ref={ref} gap={1}>
      <Text color="cyan">{FRAMES[frame]}</Text>
      <Text>{label}</Text>
    </Box>
  )
}

render(<Spinner label="loading…" />)
```

### How it works

1. `useAnimationFrame(80)` ticks every 80ms and returns `[ref, time]`. `time` is the shared clock value in ms.
2. `frame = Math.floor(time / 80) % FRAMES.length` selects which glyph to render. Multiple spinners on screen stay in lockstep because the clock is shared.
3. The returned `ref` attaches to the spinner's `<Box>`. When the box scrolls offscreen (inside a `<ScrollBox>`) or the terminal tab loses focus, `useAnimationFrame` unsubscribes from the clock and the spinner freezes — no wasted ticks, no per-frame diffs that produce nothing.
4. Resuming is automatic: the moment the box re-enters the viewport, the hook resubscribes and `time` jumps to the current clock value.

## Progress bar

A determinate bar with a width-scaled fill and an optional percent label.

```tsx
import { Box, Text, render, useInput } from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

function ProgressBar({
  progress,
  width = 30,
  showPercent = true,
}: {
  progress: number // 0..1
  width?: number
  showPercent?: boolean
}): React.ReactNode {
  const clamped = Math.max(0, Math.min(1, progress))
  const filled = Math.round(clamped * width)
  const empty = width - filled

  return (
    <Box gap={1}>
      <Text backgroundColor="green">{' '.repeat(filled)}</Text>
      <Text dim>{'─'.repeat(empty)}</Text>
      {showPercent && <Text>{Math.round(clamped * 100)}%</Text>}
    </Box>
  )
}

function Demo(): React.ReactNode {
  const [p, setP] = useState(0.42)
  useInput((input) => {
    if (input === '+') setP((v) => Math.min(1, v + 0.05))
    if (input === '-') setP((v) => Math.max(0, v - 0.05))
  })
  return (
    <Box flexDirection="column" padding={1}>
      <ProgressBar progress={p} />
      <Text dim>+/- to adjust</Text>
    </Box>
  )
}

render(<Demo />)
```

### How it works

1. **Scale to width**: `filled = Math.round(progress * width)`. The bar's total cell count is fixed; only the split between filled and empty changes.
2. **Two adjacent `<Text>` runs**: filled cells use `backgroundColor` for a solid block; empty cells use a `─` glyph dimmed. Diff-based output means changing the split touches only the cells that flipped — typically 1 cell per percent.
3. **Clamp before render**: `Math.max(0, Math.min(1, progress))` keeps a runaway upstream value from rendering a bar wider than `width`.
4. **No animation hook needed**: progress is driven by the consumer's state. Re-render whenever the underlying work reports.

## Indeterminate progress

A bouncing block for work with no measurable completion.

```tsx
import { Box, Text, render, useAnimationFrame } from '@yokai/renderer'
import type React from 'react'

function IndeterminateBar({
  width = 30,
  blockSize = 6,
}: {
  width?: number
  blockSize?: number
}): React.ReactNode {
  const [ref, time] = useAnimationFrame(60)
  const span = width - blockSize
  // Triangle wave: 0 → span → 0 over 2 * span frames.
  const cycle = span * 2
  const phase = Math.floor(time / 60) % cycle
  const pos = phase <= span ? phase : cycle - phase

  return (
    <Box ref={ref}>
      <Text dim>{'─'.repeat(pos)}</Text>
      <Text backgroundColor="cyan">{' '.repeat(blockSize)}</Text>
      <Text dim>{'─'.repeat(span - pos)}</Text>
    </Box>
  )
}

render(<IndeterminateBar />)
```

### How it works

1. **Triangle wave on the clock**: `phase` walks `0 → 2*span` and folds back on itself, giving a position that bounces between `0` and `span` without easing.
2. **Three runs**: leading dim `─` (left padding), the cyan-bg block, trailing dim `─` (right padding). All three widths sum to `width`.
3. **Same offscreen-pause behaviour as the spinner**: the `ref` from `useAnimationFrame` ties the animation lifecycle to viewport visibility.

## Variations

- **Braille spinner**: swap `FRAMES` for the full 8-frame braille set `['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧']` for smoother rotation.
- **Multi-spinner status list**: render N `<Spinner>` instances stacked; they all share the clock, so the visual rhythm stays coherent.
- **Stepped progress**: render N filled blocks instead of cells (e.g. `[██░░░]` over 5 steps) for a chunky low-res bar.
- **Coloured-by-progress bar**: red below 30%, yellow below 70%, green above — derive `backgroundColor` from `progress`.
- **ETA suffix**: alongside the percent label, render a remaining-time estimate computed from `progress` and elapsed wall time.
- **Pulsing block**: instead of bouncing, modulate the block's brightness via alternating `backgroundColor` values keyed off `time`.

## Related

- [`useAnimationFrame`](../hooks/use-animation-frame.md) — shared clock, viewport-aware pause.
- [`useTerminalViewport`](../hooks/use-terminal-viewport.md) — the visibility primitive `useAnimationFrame` is built on.
- [`Box`](../components/box.md), [`Text`](../components/text.md)
