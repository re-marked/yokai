/**
 * yokai · draggable editor demo.
 *
 *   pnpm demo:tui-desktop
 *
 * A draggable, multi-line editor + three colored draggable squares.
 * Drag the editor's title bar, type to edit, drag-select to highlight.
 * Drag the squares to demonstrate z-index reordering — click any one
 * to raise it above the others.
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
            through if dragged over it. */}
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
            <CloseButton onClose={exit} />
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
        {/* Three solid colored squares — drag them around, click any
            one to raise above the others. Cascading initial positions
            so they overlap visually, the z-order is interactive. No
            content inside; pure colored blocks demonstrate drag and
            stacking without any chrome. */}
        <Draggable initialPos={{ left: 4, top: 18 }} width={10} height={4} backgroundColor="red" />
        <Draggable
          initialPos={{ left: 10, top: 19 }}
          width={10}
          height={4}
          backgroundColor="blue"
        />
        <Draggable
          initialPos={{ left: 16, top: 20 }}
          width={10}
          height={4}
          backgroundColor="green"
        />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
