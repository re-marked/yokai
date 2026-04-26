/**
 * Constrained-vs-free drag demo.
 *
 *   pnpm demo:constrained-drag
 *
 * Two parent containers side by side. Each contains two `<Draggable>`s:
 *
 *   - **constrained** (cyan/green): pass `bounds={containerBounds}` so
 *     the box stays inside the parent. Drag against an edge, it stops.
 *
 *   - **free** (magenta/orange): no `bounds` prop → drag anywhere on
 *     screen, including past the parent's edge into the other container
 *     or onto the title text.
 *
 * Same `<Draggable>` component handles both — the only difference is
 * presence/absence of `bounds`. Mixed-mode drag in one screen is the
 * realistic shape for actual TUI apps: persistent layout regions
 * alongside transient widgets that can be repositioned anywhere.
 *
 * Press q or Escape to quit.
 */

import { AlternateScreen, Box, Draggable, Text, render, useApp, useInput } from '@yokai/renderer'
import type React from 'react'

const CONTAINER_W = 36
const CONTAINER_H = 10
const BOX_W = 10
const BOX_H = 3
const containerBounds = { width: CONTAINER_W, height: CONTAINER_H }

function Container({
  top,
  left,
  bgColor,
  children,
}: {
  top: number
  left: number
  bgColor: string
  children?: React.ReactNode
}): React.ReactNode {
  return (
    <Box
      position="absolute"
      top={top}
      left={left}
      width={CONTAINER_W}
      height={CONTAINER_H}
      backgroundColor={bgColor}
      // zIndex keeps the container behind the inner draggables (Draggable
      // base z is 10, drag-time boost adds 1000 on top) but in front of
      // background. Without it the in-flow header text could end up
      // on top in the equal-z tree-order tiebreak.
      zIndex={1}
    >
      {children}
    </Box>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%" padding={1}>
        <Text bold>yokai · constrained-vs-free drag demo</Text>
        <Text dim>
          left container: <Text color="cyan">cyan</Text> = constrained,{' '}
          <Text color="magenta">magenta</Text> = free
        </Text>
        <Text dim>
          right container: <Text color="green">green</Text> = constrained,{' '}
          <Text color="yellow">orange</Text> = free
        </Text>
        <Text dim>
          drag a constrained box against an edge — it stops. drag a free box past the edge — it
          leaves and can land anywhere on screen. <Text bold>q</Text> / <Text bold>Esc</Text> quits.
        </Text>

        <Container top={6} left={2} bgColor="#1a1a3a">
          <Draggable
            initialPos={{ top: 1, left: 2 }}
            width={BOX_W}
            height={BOX_H}
            backgroundColor="cyan"
            bounds={containerBounds}
          />
          <Draggable
            initialPos={{ top: 5, left: 18 }}
            width={BOX_W}
            height={BOX_H}
            backgroundColor="magenta"
          />
        </Container>

        <Container top={6} left={44} bgColor="#3a1a1a">
          <Draggable
            initialPos={{ top: 1, left: 2 }}
            width={BOX_W}
            height={BOX_H}
            backgroundColor="green"
            bounds={containerBounds}
          />
          <Draggable
            initialPos={{ top: 5, left: 18 }}
            width={BOX_W}
            height={BOX_H}
            backgroundColor="orange"
          />
        </Container>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
