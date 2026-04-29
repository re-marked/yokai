/**
 * yokai · draggable editor demo.
 *
 *   pnpm demo:tui-desktop
 *
 * A single draggable, multi-line editor in the terminal. Drag the
 * title bar to move it, type to edit, drag-select to highlight.
 *
 * The pre-loaded content explains what yokai is. The window itself
 * is the proof — soft-wrap, multi-line cursor nav, mouse drag, all
 * in a terminal.
 *
 * Press `q` or Ctrl+C to quit.
 */

import {
  AlternateScreen,
  Box,
  Draggable,
  type MouseDownEvent,
  Text,
  TextInput,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useCallback, useState } from 'react'

const INITIAL_TEXT = `A React terminal renderer with cell-precise mouse events, multi-line text input with soft-wrap, and a pure-TypeScript Yoga flexbox layout engine.

Drag this window by its title bar. Type to edit. Drag-select across rows. The cursor follows wrap boundaries and selection paints as one continuous stripe.

A TUI that doesn't feel like 1985.`

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
  })

  const [text, setText] = useState(INITIAL_TEXT)

  // Close button isolates its own gesture so the click doesn't bubble
  // to the underlying Draggable's mouseDown (which would race a
  // phantom drag-start). On release, exit the demo.
  const handleClose = useCallback(
    (e: MouseDownEvent) => {
      e.stopImmediatePropagation()
      e.captureGesture({ onUp: () => exit() })
    },
    [exit],
  )

  return (
    <AlternateScreen mouseTracking pasteThreshold={32}>
      <Box flexDirection="column" width="100%" height="100%">
        {/* Top header — centered title + helper text. Two rows, no
            border, no chrome. The bare "yokai" reads as the brand
            mark; the line below tells you what to do. */}
        <Box flexDirection="column" alignItems="center" paddingTop={1}>
          <Text bold>yokai</Text>
          <Text dim>drag · type · select · q to quit</Text>
        </Box>
        {/* Desktop area — holds the draggable editor. Takes the rest
            of the terminal height; the editor positions itself within
            this area. */}
        <Box flexDirection="column" flexGrow={1}>
          <Draggable
            initialPos={{ left: 8, top: 2 }}
            width={56}
            height={14}
            borderStyle="single"
            borderColor="gray"
            flexDirection="column"
          >
            {/* Title bar — drag handle + close button. Plain,
                monochrome, no accent. The window itself is the
                focus. No horizontal rule under it; the border above
                is enough chrome. */}
            <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
              <Text dim>scratch.md</Text>
              <Box paddingX={1} onMouseDown={handleClose}>
                <Text dim>×</Text>
              </Box>
            </Box>
            {/* Editor — multiline soft-wrap. Content explains itself. */}
            <Box flexDirection="column" flexGrow={1} paddingX={1} paddingTop={1}>
              <TextInput
                value={text}
                onChange={setText}
                multiline
                autoFocus
                width={54}
                height={11}
                cursorStyle="bar"
                cursorBlink
              />
            </Box>
          </Draggable>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
