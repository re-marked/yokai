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

const INITIAL_TEXT = `# yokai

A React terminal renderer with cell-precise mouse events, multi-line text input with soft-wrap, and a pure-TypeScript Yoga flexbox layout engine.

Drag this window by its title bar. Type to edit. Drag-select across rows. The cursor follows wrap boundaries. Selection paints as one continuous stripe.

It's a TUI that doesn't feel like 1985.`

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
      <Box flexDirection="column" width="100%" height="100%" justifyContent="space-between">
        <Draggable
          initialPos={{ left: 8, top: 4 }}
          width={56}
          height={16}
          borderStyle="single"
          borderColor="gray"
          flexDirection="column"
        >
          {/* Title bar — drag handle + close button. Plain, monochrome,
              no accent color. The window itself is the focus. */}
          <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
            <Text dim>scratch.md</Text>
            <Box paddingX={1} onMouseDown={handleClose}>
              <Text dim>×</Text>
            </Box>
          </Box>
          {/* Subtle horizontal rule under the title — separates chrome
              from content without a heavyweight second border. */}
          <Box flexDirection="row" paddingX={1}>
            <Text dim>{'─'.repeat(54)}</Text>
          </Box>
          {/* Editor — multiline soft-wrap. The content explains itself. */}
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
        {/* Footer hint — minimal, dim, single line at the bottom. */}
        <Box paddingX={2} paddingY={0}>
          <Text dim>drag · type · select · q to quit</Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
