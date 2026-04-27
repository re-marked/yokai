# Sortable List

A vertical list whose rows can be dragged to reorder. Reach for this when the user needs to set priority — task lists, playlist queues, layer panels.

## Code

```tsx
import {
  AlternateScreen,
  Box,
  Draggable,
  DropTarget,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

type Item = { id: string; label: string }

const LIST_LEFT = 4
const LIST_TOP = 4
const ROW_W = 28
const ROW_H = 3
const SLOT_H = ROW_H + 1 // 1-cell gap between rows

const INITIAL: Item[] = [
  { id: 'a', label: 'write design doc' },
  { id: 'b', label: 'send invoice' },
  { id: 'c', label: 'review PR #42' },
  { id: 'd', label: 'book flight' },
  { id: 'e', label: 'reply to mark' },
]

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const [items, setItems] = useState<Item[]>(INITIAL)
  const [hovered, setHovered] = useState<number | null>(null)
  // Bumped on every release so each <Draggable> re-mounts at its slot.
  const [dropTick, setDropTick] = useState(0)

  function reorder(fromId: string, toIdx: number): void {
    setItems((prev) => {
      const fromIdx = prev.findIndex((x) => x.id === fromId)
      if (fromIdx < 0 || fromIdx === toIdx) return prev
      const next = prev.slice()
      const [moved] = next.splice(fromIdx, 1)
      next.splice(toIdx, 0, moved)
      return next
    })
  }

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>drag rows to reorder</Text>
        <Text dim>q / Esc quits</Text>

        {/* One DropTarget per slot. Renders behind the rows; on drop it
            asks for the dragged id and inserts at this slot's index. */}
        {items.map((_, idx) => (
          <DropTarget
            key={`slot-${idx}`}
            accept={(d) => (d as { kind?: string } | undefined)?.kind === 'row'}
            onDragEnter={() => setHovered(idx)}
            onDragLeave={() => setHovered((cur) => (cur === idx ? null : cur))}
            onDrop={({ data }) => {
              const id = (data as { id: string }).id
              reorder(id, idx)
              setHovered(null)
            }}
            position="absolute"
            top={LIST_TOP + idx * SLOT_H}
            left={LIST_LEFT}
            width={ROW_W}
            height={ROW_H}
            backgroundColor={hovered === idx ? '#2c2c66' : '#1a1a3a'}
            zIndex={1}
          />
        ))}

        {items.map((item, idx) => (
          <Draggable
            key={`${item.id}-${dropTick}`}
            initialPos={{ top: LIST_TOP + idx * SLOT_H, left: LIST_LEFT }}
            width={ROW_W}
            height={ROW_H}
            backgroundColor="cyan"
            dragData={{ kind: 'row', id: item.id }}
            onDragEnd={() => setDropTick((t) => t + 1)}
          >
            <Box paddingX={1} paddingY={1}>
              <Text>{item.label}</Text>
            </Box>
          </Draggable>
        ))}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **State shape**: `items` is the source of truth — order in the array is order on screen. Reordering is a `splice` out + `splice` in.
2. **One `<DropTarget>` per slot**: each target's `top` is derived from its index, so the slot positions are deterministic from `items.length`. The target's `onDrop` receives the dragged id and calls `reorder(id, slotIdx)`.
3. **One `<Draggable>` per item**: positioned absolutely at the slot derived from its index. `dragData` carries `{ kind: 'row', id }` so drop targets can filter and identify.
4. **The dropTick re-key trick**: `<Draggable>` is uncontrolled — it seeds from `initialPos` on mount and never reads it again. To snap a row back to its new slot after a release, bump `dropTick` and fold it into the `key`. React unmounts and remounts; the new mount picks up the new `initialPos`. Covers same-slot drops, drops outside any slot, and cross-slot drops with one mechanism.
5. **`accept` filter** rejects non-row data so e.g. a future "drag tag onto row" doesn't accidentally trigger reorder.
6. **z-stacking**: slots paint at `zIndex={1}`; `<Draggable>` defaults to z=10, drag-time boost to 1010. Rows always render above slots; the actively dragged row renders above other rows.

## Variations

- **Per-row swap on drop** (instead of insert-at-index): change `reorder` to swap the dragged item with whatever sits at `toIdx`. One DropTarget per row still works.
- **Drag handle only**: render a small grip column inside the row and put the `<Draggable>` chrome around just that column — the rest of the row stops being draggable.
- **Horizontal sortable**: lay out slots / draggables along `left` instead of `top`. The pattern is symmetric.
- **Animate the snap**: instead of the dropTick re-key, drive `top` via local state and tween it to the target slot in a `useAnimationFrame` loop before settling.
- **Persist order**: add a `useEffect` watching `items` that writes the order array to disk or remote.

## Related

- [`Draggable`](../components/draggable.md)
- [`DropTarget`](../components/drop-target.md)
- Demo: [`examples/drag-and-drop/dnd.tsx`](../../examples/drag-and-drop/dnd.tsx) — the dropTick trick originates here.
