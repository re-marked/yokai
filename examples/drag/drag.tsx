/**
 * Drag-and-drop demo.
 *
 *   pnpm demo:drag
 *
 * Renders a draggable box in the alt-screen buffer. Press the box,
 * drag it with the mouse, release to drop. Press 'q' or Escape to exit.
 *
 * Exercises the full mouse-events stack:
 *   - <AlternateScreen mouseTracking> enables SGR mouse modes
 *   - onMouseDown fires on press
 *   - event.captureGesture() claims the gesture for this drag, suppressing
 *     selection extension
 *   - onMove updates React state on each cell-crossing motion event
 *   - The diff engine repaints only the changed cells per frame
 *   - zIndex={10} keeps the box on top of background content
 *   - onUp fires once at release; capture clears
 *
 * If anything stutters, lags, or the box doesn't follow the cursor,
 * something in the chain is broken — file a bug.
 */

import React, { useState } from 'react'
import {
  AlternateScreen,
  Box,
  type MouseDownEvent,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'

type Pos = { top: number; left: number }

function Draggable({
  initialPos,
  color,
}: {
  initialPos: Pos
  color: string
}): React.ReactNode {
  const [pos, setPos] = useState(initialPos)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = (e: MouseDownEvent): void => {
    // Anchor the drag at the cursor's offset within the box so the
    // grabbed point stays under the cursor as the user moves.
    const startTop = pos.top
    const startLeft = pos.left
    const startCol = e.col
    const startRow = e.row
    setIsDragging(true)
    e.captureGesture({
      onMove(m) {
        setPos({
          top: startTop + (m.row - startRow),
          left: startLeft + (m.col - startCol),
        })
      },
      onUp() {
        setIsDragging(false)
      },
    })
  }

  const fillColor = isDragging ? 'yellow' : color
  return (
    <Box
      position="absolute"
      top={pos.top}
      left={pos.left}
      width={20}
      height={3}
      zIndex={10}
      backgroundColor={fillColor}
      onMouseDown={handleMouseDown}
    />
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai · drag demo</Text>
        <Text dim>
          press a box, drag it, release. <Text bold>q</Text> or <Text bold>Esc</Text> to quit.
        </Text>
        <Text dim>
          three boxes overlap at start — drag the front one (highest zIndex) to expose the others.
        </Text>

        {/* Three boxes at staggered start positions, different zIndexes
            so we can see the z-index code in action. The box at z=12
            paints on top until the user drags it elsewhere. */}
        <Draggable initialPos={{ top: 6, left: 4 }} color="cyan" />
        <Draggable initialPos={{ top: 7, left: 8 }} color="green" />
        <Draggable initialPos={{ top: 8, left: 12 }} color="magenta" />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
