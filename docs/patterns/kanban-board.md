# Kanban Board

Multi-column board with cards that drag between columns. Reach for this when you need a status pipeline: ticketing, hiring funnels, build stages.

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

type Card = { id: string; label: string }
type ColumnId = 'todo' | 'doing' | 'done'
type Columns = Record<ColumnId, Card[]>

const COLUMN_W = 24
const COLUMN_H = 14
const CARD_W = 20
const CARD_H = 3
const COLUMN_TOP = 6
const CARD_SLOT_H = CARD_H + 1

const COLUMNS: { id: ColumnId; left: number; bg: string; bgHover: string; title: string }[] = [
  { id: 'todo', left: 2, bg: '#1a1a3a', bgHover: '#2c2c66', title: 'todo' },
  { id: 'doing', left: 30, bg: '#3a2e1a', bgHover: '#665322', title: 'doing' },
  { id: 'done', left: 58, bg: '#1a3a1a', bgHover: '#2c662c', title: 'done' },
]

const CARD_COLOR: Record<ColumnId, string> = {
  todo: 'cyan',
  doing: 'yellow',
  done: 'green',
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const [columns, setColumns] = useState<Columns>({
    todo: [
      { id: 'c1', label: 'fix notch bug' },
      { id: 'c2', label: 'add Draggable' },
    ],
    doing: [{ id: 'c3', label: 'wire registry' }],
    done: [{ id: 'c4', label: 'z-index suite' }],
  })
  const [hovered, setHovered] = useState<ColumnId | null>(null)
  const [dropTick, setDropTick] = useState(0)

  function findCard(id: string): { col: ColumnId; idx: number } | null {
    for (const c of ['todo', 'doing', 'done'] as ColumnId[]) {
      const idx = columns[c].findIndex((x) => x.id === id)
      if (idx >= 0) return { col: c, idx }
    }
    return null
  }

  function moveCard(id: string, toCol: ColumnId): void {
    const found = findCard(id)
    if (!found || found.col === toCol) return
    setColumns((prev) => {
      const card = prev[found.col][found.idx]!
      const next = { ...prev }
      next[found.col] = prev[found.col].filter((x) => x.id !== id)
      next[toCol] = [...prev[toCol], card]
      return next
    })
  }

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>kanban</Text>

        {COLUMNS.map((col) => (
          <DropTarget
            key={col.id}
            accept={(d) => (d as { kind?: string } | undefined)?.kind === 'card'}
            onDragEnter={() => setHovered(col.id)}
            onDragLeave={() => setHovered((cur) => (cur === col.id ? null : cur))}
            onDrop={({ data }) => {
              moveCard((data as { id: string }).id, col.id)
              setHovered(null)
            }}
            position="absolute"
            top={COLUMN_TOP}
            left={col.left}
            width={COLUMN_W}
            height={COLUMN_H}
            backgroundColor={hovered === col.id ? col.bgHover : col.bg}
            zIndex={1}
          >
            <Box paddingX={1}>
              <Text bold dim>{col.title}</Text>
            </Box>
          </DropTarget>
        ))}

        {(['todo', 'doing', 'done'] as ColumnId[]).flatMap((colId) => {
          const col = COLUMNS.find((c) => c.id === colId)!
          return columns[colId].map((card, idx) => (
            <Draggable
              key={`${card.id}-${dropTick}`}
              initialPos={{
                top: COLUMN_TOP + 2 + idx * CARD_SLOT_H,
                left: col.left + 2,
              }}
              width={CARD_W}
              height={CARD_H}
              backgroundColor={CARD_COLOR[colId]}
              dragData={{ kind: 'card', id: card.id }}
              onDragEnd={() => setDropTick((t) => t + 1)}
            >
              <Box paddingX={1} paddingY={1}>
                <Text>{card.label}</Text>
              </Box>
            </Draggable>
          ))
        })}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **State shape**: `columns` is `Record<ColumnId, Card[]>`. Cross-column moves are filter-out-of-source + push-to-destination — no global card array, no per-card `columnId` field to keep in sync.
2. **`accept` filter**: each column only accepts `kind === 'card'` data. Plain text labels or future drag types are ignored — drops on a column with a non-card payload are no-ops.
3. **Topmost-wins drop dispatch**: during a between-column drag the card overlaps both columns visually; the drop registry routes the release to whichever target the cursor is over at release time, not whichever was entered first. Hover state on both columns toggles cleanly via the symmetric `onDragEnter` / `onDragLeave`.
4. **`hovered` state**: a single `ColumnId | null`. Only one column can be hovered at a time because their rects don't overlap, so `onDragLeave` clearing checks `cur === col.id` to avoid races where the leave fires after the next column's enter.
5. **The dropTick re-key trick**: `<Draggable>` is uncontrolled (only reads `initialPos` at mount). On every release `dropTick` bumps; the card's `key` changes; React unmounts and remounts at the new column's slot. Same mechanism handles snap-back when dropped outside any column (`moveCard` returns early, but the remount still snaps the card home).
6. **z-stacking**: columns at z=1, cards default to z=10 (Draggable base), the actively dragged card boosts to z=1010 — so it floats over both source and destination columns during the drag.
7. **Slot positioning**: each card's `initialPos` is derived from its index in its column. After a move the destination column's array gains an entry at the end and the card mounts at that slot.

## Variations

- **Insert at specific index**: instead of pushing to the end of the destination column, give each column N+1 inner DropTargets (one between each pair of cards) and reorder on drop.
- **Per-card limits**: clamp `columns.doing.length <= 3` (WIP limit) inside `moveCard` and visually flag the column when full.
- **Drag from outside the board**: a sidebar `<Draggable dragData={{ kind: 'template', ... }}>` can drop into a column if you widen the `accept` filter and synthesize a new card on drop.
- **Persist board state**: `useEffect` on `columns` writes to disk; on mount, hydrate from disk before first render.
- **Vertical board**: swap the column layout — rows of swimlanes with cards arranged horizontally inside each.

## Related

- [`Draggable`](../components/draggable.md)
- [`DropTarget`](../components/drop-target.md)
- [Sortable list pattern](./sortable-list.md) — single-column reorder using the same primitives.
- Demo: [`examples/drag-and-drop/dnd.tsx`](../../examples/drag-and-drop/dnd.tsx) — this pattern is the demo, near-verbatim.
