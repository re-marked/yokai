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
        <Draggable initialPos={{ left: 4, top: 2 }} width={22} height={5} backgroundColor="#a5f3fc" />
        <Draggable initialPos={{ left: 12, top: 4 }} width={22} height={5} backgroundColor="#22d3ee" />
        <Draggable
          initialPos={{ left: 20, top: 6 }}
          width={22}
          height={5}
          backgroundColor="#0e7490"
        />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
