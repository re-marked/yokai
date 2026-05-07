/**
 * Gesture capture demo.
 *
 *   pnpm demo:gesture-capture
 *
 * The button inside the Draggable claims its press with captureGesture()
 * but does NOT call stopImmediatePropagation(). With leaf-first capture,
 * the parent Draggable cannot steal the gesture. Drag the panel from
 * anywhere else to confirm parent drags still work.
 *
 * Press q, Escape, or Ctrl+C to quit.
 */

import {
  AlternateScreen,
  Box,
  Draggable,
  type MouseDownEvent,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai-tui/renderer'
import type React from 'react'
import { useCallback, useState } from 'react'

const PANEL_WIDTH = 58
const PANEL_HEIGHT = 13

function ClaimButton({
  onClaim,
}: {
  onClaim: () => void
}): React.ReactNode {
  const [pressed, setPressed] = useState(false)

  const handleMouseDown = useCallback(
    (event: MouseDownEvent) => {
      setPressed(true)
      event.captureGesture({
        onUp: () => {
          setPressed(false)
          onClaim()
        },
      })
    },
    [onClaim],
  )

  return (
    <Box
      width={28}
      height={3}
      alignItems="center"
      justifyContent="center"
      borderStyle="round"
      borderColor={pressed ? '#fbbf24' : '#38bdf8'}
      backgroundColor={pressed ? '#451a03' : '#082f49'}
      onMouseDown={handleMouseDown}
    >
      <Text bold color={pressed ? '#fde68a' : '#bae6fd'}>
        claim press
      </Text>
    </Box>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  const [claims, setClaims] = useState(0)
  const [drags, setDrags] = useState(0)
  const [last, setLast] = useState('Ready. Press the button, then drag the panel body.')

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai gesture capture demo</Text>
        <Text dim>
          The button captures without stopImmediatePropagation. q / Escape exits.
        </Text>

        <Draggable
          initialPos={{ left: 6, top: 5 }}
          width={PANEL_WIDTH}
          height={PANEL_HEIGHT}
          borderStyle="single"
          borderColor="#64748b"
          backgroundColor="#020617"
          flexDirection="column"
          paddingX={1}
          paddingTop={1}
          onDragStart={() => {
            setDrags((count) => count + 1)
            setLast('Parent Draggable started a drag.')
          }}
        >
          <Text bold>Draggable parent</Text>
          <Text dim>
            Press the blue button: child capture should win, and the panel should not drag.
          </Text>
          <Text dim>Drag the empty panel body: parent Draggable should move.</Text>

          <Box marginTop={1}>
            <ClaimButton
              onClaim={() => {
                setClaims((count) => count + 1)
                setLast('Child claimed press and received release.')
              }}
            />
          </Box>

          <Box flexDirection="column" marginTop={1}>
            <Text>
              child claims: <Text bold>{claims}</Text>
            </Text>
            <Text>
              parent drags: <Text bold>{drags}</Text>
            </Text>
            <Text color="#a7f3d0">{last}</Text>
          </Box>
        </Draggable>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
