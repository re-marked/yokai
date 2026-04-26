/**
 * Drag-and-drop demo: cards into columns.
 *
 *   pnpm demo:drag-and-drop
 *
 * Three columns ("todo" / "doing" / "done"), each a `<DropTarget>` that
 * accepts cards. Drag a card from any column to any other; release over
 * a column to move it. Drop a card outside any column → snaps back.
 *
 * Exercises the full primitive stack:
 *
 *   - `<Draggable dragData={{ id, kind: 'card' }}>` — the gesture wiring,
 *     raise-on-press, drag-time z boost. Cards live in absolute
 *     coordinates per column so they can drag freely; on drop the parent
 *     re-assigns ownership and the card snaps to its new column's slot.
 *   - `<DropTarget accept={(d) => d.kind === 'card'}>` — fires onDragEnter
 *     to highlight, onDragLeave to un-highlight, onDrop to commit the
 *     move. Topmost rule resolves drop dispatch when columns overlap
 *     mid-drag (during a between-columns swing the card paints over both).
 *   - `accept` filtering — drop the title text on a column? Nothing
 *     happens. Only cards are accepted. (This demo's title bar is plain
 *     text, but in a real app you might have multiple kinds of draggables.)
 *
 * Press q or Escape to quit.
 */

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
type Columns = Record<ColumnId, Card[]>
type ColumnId = 'todo' | 'doing' | 'done'

const COLUMN_W = 24
const COLUMN_H = 14
const CARD_W = 20
const CARD_H = 3
const COLUMN_TOP = 6
const CARD_SLOT_HEIGHT = CARD_H + 1 // 1-cell gap between cards

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
      { id: 'c3', label: 'add DropTarget' },
    ],
    doing: [{ id: 'c4', label: 'wire registry' }],
    done: [
      { id: 'c5', label: 'z-index suite' },
      { id: 'c6', label: 'hit-test fixes' },
    ],
  })
  // Per-column hover state for drag-over highlight.
  const [hovered, setHovered] = useState<ColumnId | null>(null)
  // Bumped on every release; folded into each Draggable's `key` so the
  // component re-mounts and snaps to its column slot. <Draggable> is
  // intentionally uncontrolled — `initialPos` only applies at mount —
  // so this is the idiomatic way to push it back to a known position
  // after a drag. Covers three cases at once: same-column drops (card
  // returns to its slot), drops outside any column (`dropped:false`,
  // card returns to its column), and cross-column drops (card mounts
  // fresh at the new column's slot).
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
    if (!found) return
    if (found.col === toCol) return // No-op; would re-render and snap to same slot anyway.
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
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai · drag-and-drop demo</Text>
        <Text dim>
          drag cards between columns. drop outside a column to snap back. <Text bold>q</Text> /{' '}
          <Text bold>Esc</Text> quits.
        </Text>

        {COLUMNS.map((col) => (
          <DropTarget
            key={col.id}
            accept={(d) => (d as { kind?: string } | undefined)?.kind === 'card'}
            onDragEnter={() => setHovered(col.id)}
            onDragLeave={() => {
              // Leave only clears if we're STILL marked as hovered for
              // this column. Two columns can't both be hovered (their
              // rects don't overlap) so this is unambiguous.
              setHovered((cur) => (cur === col.id ? null : cur))
            }}
            onDrop={({ data }) => {
              const id = (data as { id: string }).id
              moveCard(id, col.id)
              setHovered(null)
            }}
            position="absolute"
            top={COLUMN_TOP}
            left={col.left}
            width={COLUMN_W}
            height={COLUMN_H}
            backgroundColor={hovered === col.id ? col.bgHover : col.bg}
            // Behind cards (which start at z=10 from Draggable's base).
            zIndex={1}
          >
            <Box paddingX={1} paddingTop={0}>
              <Text bold dim>
                {col.title}
              </Text>
            </Box>
          </DropTarget>
        ))}

        {/* Render cards. Each card lives at its column's slot position
            (absolute, relative to column bounds via screen coords).
            On drop, the column moves the card; on the next render the
            card mounts at its new slot, snapping into place. */}
        {(['todo', 'doing', 'done'] as ColumnId[]).flatMap((colId) => {
          const col = COLUMNS.find((c) => c.id === colId)!
          return columns[colId].map((card, idx) => (
            <Draggable
              // Re-key on every drop so the Draggable remounts at its
              // column's slot — see `dropTick` comment above.
              key={`${card.id}-${dropTick}`}
              // Slot position. Top: under the column title row. Left:
              // a bit inset from the column's left edge.
              initialPos={{
                top: COLUMN_TOP + 2 + idx * CARD_SLOT_HEIGHT,
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
