/**
 * yokai · drag.
 *
 *   pnpm demo:drag
 *
 * Three rectangles. Drag them onto the drop zone — they shrink in
 * place and lock there. q to quit.
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
} from '@yokai-tui/renderer'
import type React from 'react'
import { useState } from 'react'

const RECT_W = 22
const RECT_H = 5
const SMALL_W = 11
const SMALL_H = 2

const RECTS = [
  { id: 'a', left: 4, top: 5, color: '#a5f3fc' },
  { id: 'b', left: 12, top: 7, color: '#22d3ee' },
  { id: 'c', left: 20, top: 9, color: '#0e7490' },
]

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  // Map of rect id → final position of the shrunk tile (top-left in
  // screen cells). Presence in this map means the rect has been
  // dropped and is no longer rendered as a Draggable.
  const [dropped, setDropped] = useState<Record<string, { left: number; top: number }>>({})
  const [hovered, setHovered] = useState(false)

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" alignItems="center" paddingTop={1}>
          <Text bold>yokai</Text>
          <Text dim>drag · q to quit</Text>
        </Box>
        <DropTarget
          position="absolute"
          top={5}
          left={50}
          width={28}
          height={9}
          borderStyle="single"
          borderColor={hovered ? '#a5f3fc' : '#475569'}
          alignItems="center"
          justifyContent="center"
          onDragEnter={() => setHovered(true)}
          onDragLeave={() => setHovered(false)}
          onDrop={() => setHovered(false)}
        >
          <Text dim color={hovered ? '#a5f3fc' : 'gray'}>
            drop
          </Text>
        </DropTarget>
        {RECTS.filter((r) => !dropped[r.id]).map((r) => (
          <Draggable
            key={r.id}
            initialPos={{ left: r.left, top: r.top }}
            width={RECT_W}
            height={RECT_H}
            backgroundColor={r.color}
            dragData={{ id: r.id }}
            onDragEnd={(info) => {
              if (!info.dropped) return
              // Shrink-around-center: keep the visual midpoint roughly
              // where it was when released.
              setDropped((prev) => ({
                ...prev,
                [r.id]: {
                  left: info.pos.left + Math.floor((RECT_W - SMALL_W) / 2),
                  top: info.pos.top + Math.floor((RECT_H - SMALL_H) / 2),
                },
              }))
            }}
          />
        ))}
        {Object.entries(dropped).map(([id, pos]) => {
          const r = RECTS.find((x) => x.id === id)!
          return (
            <Box
              key={id}
              position="absolute"
              top={pos.top}
              left={pos.left}
              width={SMALL_W}
              height={SMALL_H}
              backgroundColor={r.color}
            />
          )
        })}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
