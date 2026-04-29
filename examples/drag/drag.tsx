/**
 * yokai · drag.
 *
 *   pnpm demo:drag
 *
 * Three rectangles. Drag them onto the drop zone. q to quit.
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

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const [hovered, setHovered] = useState(false)

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%">
        <Box flexDirection="column" alignItems="center" paddingTop={1}>
          <Text bold>yokai</Text>
          <Text dim>drag · q to quit</Text>
        </Box>
        <Draggable initialPos={{ left: 4, top: 5 }} width={22} height={5} backgroundColor="#a5f3fc" />
        <Draggable initialPos={{ left: 12, top: 7 }} width={22} height={5} backgroundColor="#22d3ee" />
        <Draggable
          initialPos={{ left: 20, top: 9 }}
          width={22}
          height={5}
          backgroundColor="#0e7490"
        />
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
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
