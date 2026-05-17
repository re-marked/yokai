/**
 * yokai · surface
 *
 *   pnpm demo:surface
 *
 * Visual showcase for the `<Surface>` primitive (A23):
 *
 *   1. LAYER STACK — base panel, overlay, modal, tooltip — each at
 *      its named layer. Paint order ascends with the band.
 *   2. BACKDROP — modal Surface with `backdrop` auto-renders a sibling
 *      scrim filling the parent, layered just below the modal.
 *   3. ELEVATION ROW — six Surfaces at elevation 0..5 side-by-side,
 *      so the shadow band's growth is visible at a glance.
 *   4. HIT-TEST BOUNDARY — clickable Surface with hitTestBoundary
 *      sits above a sibling that also wants clicks. Clicks on the
 *      boundary go to the boundary, never to the sibling.
 *   5. COMPOSITION — an absolute Surface (layer='overlay', elevation
 *      2) hosting a Draggable. The drag-time z boost on the inner
 *      Draggable still wins paint over the outer Surface's chrome.
 *
 * `t` toggles the modal + backdrop demo. `q` or Esc to quit.
 */

import {
  AlternateScreen,
  Box,
  Draggable,
  Surface,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai-tui/renderer'
import type React from 'react'
import { useState } from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  const [modalOpen, setModalOpen] = useState(false)
  const [boundaryClicks, setBoundaryClicks] = useState(0)
  const [siblingClicks, setSiblingClicks] = useState(0)
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
    if (input === 't') setModalOpen((o) => !o)
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai · Surface demo</Text>
        <Text dim>q to quit · t to toggle modal</Text>

        {/* 3. ELEVATION ROW */}
        <Box marginTop={1} flexDirection="row" gap={2}>
          <Text dim>elevation:</Text>
        </Box>
        <Box flexDirection="row" gap={3} marginTop={1} height={6}>
          {([0, 1, 2, 3, 4, 5] as const).map((elev) => (
            <Surface
              key={elev}
              position="absolute"
              top={5}
              left={2 + elev * 10}
              width={8}
              height={3}
              backgroundColor="#1e293b"
              borderStyle="round"
              borderColor="#475569"
              elevation={elev}
              alignItems="center"
              justifyContent="center"
            >
              <Text color="#cbd5e1">e={elev}</Text>
            </Surface>
          ))}
        </Box>

        {/* 4. HIT-TEST BOUNDARY */}
        <Box marginTop={1} flexDirection="column">
          <Text dim>
            hit-test boundary · clicks on the boundary stay on it (boundary={boundaryClicks},
            sibling={siblingClicks})
          </Text>
        </Box>
        <Box position="relative" height={6}>
          {/* Sibling at lower z that also wants clicks. */}
          <Surface
            position="absolute"
            top={1}
            left={2}
            width={30}
            height={4}
            backgroundColor="#7f1d1d"
            borderStyle="single"
            borderColor="#fca5a5"
            alignItems="center"
            justifyContent="center"
            zIndex={5}
            onClick={() => setSiblingClicks((n) => n + 1)}
          >
            <Text color="white">click me (sibling)</Text>
          </Surface>
          {/* Boundary on top. Click should ALWAYS go here when in-bounds. */}
          <Surface
            position="absolute"
            top={2}
            left={8}
            width={20}
            height={3}
            layer="modal"
            backgroundColor="#0c4a6e"
            borderStyle="round"
            borderColor="#7dd3fc"
            hitTestBoundary
            alignItems="center"
            justifyContent="center"
            onClick={() => setBoundaryClicks((n) => n + 1)}
          >
            <Text color="white">boundary</Text>
          </Surface>
        </Box>

        {/* 5. COMPOSITION — Surface w/ elevation hosts Draggable */}
        <Box marginTop={1} flexDirection="column">
          <Text dim>composition · drag the cyan card inside the elevated overlay</Text>
        </Box>
        <Box position="relative" height={10}>
          <Surface
            position="absolute"
            top={1}
            left={2}
            width={40}
            height={8}
            layer="overlay"
            backgroundColor="#0f172a"
            borderStyle="single"
            borderColor="#334155"
            elevation={2}
            padding={1}
          >
            <Text dim>elevated overlay panel</Text>
            <Draggable
              initialPos={{ top: 2, left: 4 }}
              width={12}
              height={3}
              backgroundColor="#06b6d4"
              borderStyle="single"
              borderColor="#a5f3fc"
            />
          </Surface>
        </Box>

        {/* Quick controls */}
        <Box marginTop={1}>
          <Text dim>
            press <Text bold>t</Text> to {modalOpen ? 'close' : 'open'} the modal with backdrop
          </Text>
        </Box>

        {/* 1+2. MODAL with BACKDROP */}
        {modalOpen && (
          <Surface
            position="absolute"
            top={5}
            left={20}
            width={40}
            height={8}
            layer="modal"
            backgroundColor="#0c4a6e"
            borderStyle="round"
            borderColor="#7dd3fc"
            padding={1}
            backdrop
            backdropColor="#000000"
            alignItems="center"
            justifyContent="center"
            onClick={() => setModalOpen(false)}
          >
            <Text bold color="white">
              modal at layer='modal' (z=3000)
            </Text>
            <Text color="#7dd3fc">backdrop auto-renders at z=2999</Text>
            <Text dim>click to dismiss</Text>
          </Surface>
        )}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
