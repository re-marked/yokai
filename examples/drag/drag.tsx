/**
 * Drag-and-drop demo.
 *
 *   pnpm demo:drag
 *
 * Renders three draggable boxes in the alt-screen buffer. Press a box,
 * drag it with the mouse, release to drop. Press 'q' or Escape to exit.
 *
 * Exercises the full mouse-events stack via the polished `<Draggable>`
 * primitive — the demo no longer reimplements the gesture wiring,
 * z-index bumping, or drag-time z boost. Those are baked into the
 * component now; demos just position boxes and let drag happen.
 */

import { AlternateScreen, Box, Draggable, Text, render, useApp, useInput } from '@yokai/renderer'
import type React from 'react'

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

        {/* Three solid boxes at staggered start positions. Draggable owns
            the position state, raise-on-press, and drag-time z boost. */}
        <Draggable initialPos={{ top: 6, left: 4 }} width={20} height={3} backgroundColor="cyan" />
        <Draggable initialPos={{ top: 7, left: 8 }} width={20} height={3} backgroundColor="green" />
        <Draggable
          initialPos={{ top: 8, left: 12 }}
          width={20}
          height={3}
          backgroundColor="magenta"
        />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
