/**
 * yokai · drag.
 *
 *   pnpm demo:drag
 *
 * Three rectangles. Drag them. q to quit.
 */

import { AlternateScreen, Box, Draggable, render, useApp, useInput } from '@yokai/renderer'
import type React from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%">
        <Draggable initialPos={{ left: 4, top: 2 }} width={10} height={4} backgroundColor="white" />
        <Draggable initialPos={{ left: 10, top: 3 }} width={10} height={4} backgroundColor="gray" />
        <Draggable
          initialPos={{ left: 16, top: 4 }}
          width={10}
          height={4}
          backgroundColor="blackBright"
        />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
