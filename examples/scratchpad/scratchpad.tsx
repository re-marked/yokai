/**
 * yokai · scratchpad demo.
 *
 *   pnpm demo:scratchpad
 *
 * A draggable, multi-line editor in the terminal. Drag the title bar
 * to move it, type to edit, drag-select to highlight. Click [×] to
 * close the editor (the demo stays running; press q to exit).
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
  TerminalSizeContext,
  Text,
  TextInput,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useCallback, useContext, useState } from 'react'

const WINDOW_WIDTH = 56
const WINDOW_HEIGHT = 14

const INITIAL_TEXT = `A React terminal renderer with cell-precise mouse events, multi-line text input with soft-wrap, and a pure-TypeScript Yoga flexbox layout engine.

Drag this window by its title bar. Type to edit. Drag-select across rows. The cursor follows wrap boundaries and selection paints as one continuous stripe.

A TUI that doesn't feel like 1985.`

/** Close button — turns red on hover, like the macOS / Windows
 *  traffic-light close. Uses onMouseEnter / onMouseLeave for the hover
 *  state, captures the click gesture so the press doesn't bubble to
 *  the underlying Draggable's mouseDown (which would race a phantom
 *  drag-start). */
function CloseButton({ onClose }: { onClose: () => void }): React.ReactNode {
  const [hover, setHover] = useState(false)
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      e.stopImmediatePropagation()
      e.captureGesture({ onUp: () => onClose() })
    },
    [onClose],
  )
  return (
    <Box
      paddingX={1}
      backgroundColor={hover ? 'red' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={handleMouseDown}
    >
      <Text bold={hover} color={hover ? 'white' : 'gray'}>
        ×
      </Text>
    </Box>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
  })

  const [text, setText] = useState(INITIAL_TEXT)
  const [editorOpen, setEditorOpen] = useState(true)

  // Center the editor horizontally on first paint. initialPos is
  // captured at Draggable mount and not re-applied on prop changes
  // (matches the prop's "defaultValue" semantics), so this is a
  // one-shot centering — the user can drag freely from there.
  const size = useContext(TerminalSizeContext)
  const initialLeft = size?.columns ? Math.max(0, Math.floor((size.columns - WINDOW_WIDTH) / 2)) : 8

  return (
    <AlternateScreen mouseTracking pasteThreshold={32}>
      <Box flexDirection="column" width="100%" height="100%">
        {/* Top header — centered title + helper text. */}
        <Box flexDirection="column" alignItems="center" paddingTop={1}>
          <Text bold>yokai</Text>
          <Text dim>drag · type · select · q to quit</Text>
        </Box>
        {/* Editor — black background so header text doesn't bleed
            through if dragged over it. Close [×] hides this window
            (sets editorOpen=false). q / Ctrl+C exits the demo. */}
        {editorOpen && (
          <Draggable
            initialPos={{ left: initialLeft, top: 1 }}
            width={WINDOW_WIDTH}
            height={WINDOW_HEIGHT}
            borderStyle="single"
            borderColor="gray"
            backgroundColor="black"
            flexDirection="column"
          >
            <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
              <Text dim>scratch.md</Text>
              <CloseButton onClose={() => setEditorOpen(false)} />
            </Box>
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
        )}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
