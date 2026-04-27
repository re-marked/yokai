/**
 * Resizable demo.
 *
 *   pnpm demo:resizable
 *
 * Two `<Resizable>` panels side by side. The left panel exposes all
 * three handles (s, e, se) so you can grab any edge. The right panel
 * has only the SE corner handle — the most common case for a "panel
 * you can drag the bottom-right corner of."
 *
 * Each handle paints a 1-cell strip of contrasting bg color so you can
 * see where to grab. Hover brightens the handle. Drag to resize; min
 * and max bounds keep the size sensible.
 *
 * Press q or Escape to quit.
 */

import { AlternateScreen, Box, Resizable, Text, render, useApp, useInput } from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  // Track sizes so we can display them — pure observability for the demo,
  // <Resizable> manages its own size internally.
  const [leftSize, setLeftSize] = useState({ width: 30, height: 8 })
  const [rightSize, setRightSize] = useState({ width: 30, height: 8 })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai · resizable demo</Text>
        <Text dim>
          drag the gray edges to resize. <Text bold>q</Text> / <Text bold>Esc</Text> quits.
        </Text>
        <Text dim>
          left: all three handles (south, east, south-east). right: south-east corner only.
        </Text>

        <Box flexDirection="row" gap={4} marginTop={1}>
          <Box flexDirection="column">
            <Text dim>
              size: <Text bold>{leftSize.width}</Text>×<Text bold>{leftSize.height}</Text>
            </Text>
            <Resizable
              initialSize={{ width: 30, height: 8 }}
              minSize={{ width: 10, height: 3 }}
              maxSize={{ width: 60, height: 16 }}
              handles={['s', 'e', 'se']}
              backgroundColor="#1a1a3a"
              onResize={({ size }) => setLeftSize(size)}
            >
              <Box padding={1}>
                <Text>
                  Drag any of my three handles. The south handle (bottom strip) only changes my
                  height; the east handle (right strip) only changes my width; the SE corner does
                  both at once.
                </Text>
              </Box>
            </Resizable>
          </Box>

          <Box flexDirection="column">
            <Text dim>
              size: <Text bold>{rightSize.width}</Text>×<Text bold>{rightSize.height}</Text>
            </Text>
            <Resizable
              initialSize={{ width: 30, height: 8 }}
              minSize={{ width: 10, height: 3 }}
              maxSize={{ width: 60, height: 16 }}
              backgroundColor="#3a1a1a"
              onResize={({ size }) => setRightSize(size)}
            >
              <Box padding={1}>
                <Text>
                  Default `handles={'{'}['se']{'}'}`. Grab the small marked corner to resize me
                  diagonally — the common case for a panel you want to grow without intrusive edge
                  chrome.
                </Text>
              </Box>
            </Resizable>
          </Box>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
