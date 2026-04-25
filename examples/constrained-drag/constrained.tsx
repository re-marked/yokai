/**
 * Constrained-vs-free drag demo.
 *
 *   pnpm demo:constrained-drag
 *
 * Two parent containers side by side. Each contains two draggable
 * rectangles:
 *
 *   - **constrained** (cyan/green): clamped to the parent's interior.
 *     Drag it right against an edge — it stops there. Useful for
 *     real-world UIs where some elements must stay within their
 *     region (resize handles, sliders, in-pane drag-to-reorder).
 *
 *   - **free** (orange/pink): no clamping. Drag it anywhere on screen,
 *     including past its parent's edge or into the other container.
 *     Useful for elements that can be detached from their starting
 *     pane (moving cards between columns, dragging an item to trash).
 *
 * The same Draggable component handles both — the only difference is
 * an optional `bounds` prop. When set, onMove clamps the new position;
 * when unset, the box can go anywhere. Mixed-mode drag in one screen
 * is the realistic shape for actual TUI apps: persistent layout
 * elements alongside transient draggable widgets.
 *
 * Press q or Escape to quit.
 */

import React, { useState } from 'react'
import {
  AlternateScreen,
  Box,
  type MouseDownEvent,
  Text,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'

type Pos = { top: number; left: number }
type Bounds = { width: number; height: number }

function Draggable({
  initialPos,
  width,
  height,
  color,
  bounds,
}: {
  initialPos: Pos
  width: number
  height: number
  color: string
  bounds?: Bounds
}): React.ReactNode {
  const [pos, setPos] = useState(initialPos)
  const [isDragging, setIsDragging] = useState(false)

  const handleMouseDown = (e: MouseDownEvent): void => {
    const startTop = pos.top
    const startLeft = pos.left
    const startCol = e.col
    const startRow = e.row
    setIsDragging(true)
    e.captureGesture({
      onMove(m) {
        let newTop = startTop + (m.row - startRow)
        let newLeft = startLeft + (m.col - startCol)
        // Clamp to the container's interior if bounds were provided.
        // The min/max are inclusive on the leading edge and exclusive
        // on the trailing edge minus our own size — i.e. the box's
        // (top, left) can be at the container's top-left corner (0,0)
        // but no further than (bounds.height - height, bounds.width
        // - width), so the box's bottom-right edge lands exactly on
        // the container's bottom-right edge.
        if (bounds) {
          newTop = Math.max(0, Math.min(bounds.height - height, newTop))
          newLeft = Math.max(0, Math.min(bounds.width - width, newLeft))
        }
        setPos({ top: newTop, left: newLeft })
      },
      onUp() {
        setIsDragging(false)
      },
    })
  }

  const fillColor = isDragging ? 'yellow' : color
  return (
    <Box
      position="absolute"
      top={pos.top}
      left={pos.left}
      width={width}
      height={height}
      // Lift the dragged box above its siblings so it paints on top
      // while moving. Z drops back when released.
      zIndex={isDragging ? 30 : 10}
      backgroundColor={fillColor}
      onMouseDown={handleMouseDown}
    />
  )
}

const CONTAINER_W = 36
const CONTAINER_H = 10
const BOX_W = 10
const BOX_H = 3
const containerBounds: Bounds = { width: CONTAINER_W, height: CONTAINER_H }

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
      // zIndex keeps the container behind the inner draggables (which
      // are z=10+ when idle, z=30 while dragging) but in front of
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
          leaves and can land anywhere on screen. <Text bold>q</Text> / <Text bold>Esc</Text>{' '}
          quits.
        </Text>

        <Container top={6} left={2} bgColor="#1a1a3a">
          <Draggable
            initialPos={{ top: 1, left: 2 }}
            width={BOX_W}
            height={BOX_H}
            color="cyan"
            bounds={containerBounds}
          />
          <Draggable
            initialPos={{ top: 5, left: 18 }}
            width={BOX_W}
            height={BOX_H}
            color="magenta"
          />
        </Container>

        <Container top={6} left={44} bgColor="#3a1a1a">
          <Draggable
            initialPos={{ top: 1, left: 2 }}
            width={BOX_W}
            height={BOX_H}
            color="green"
            bounds={containerBounds}
          />
          <Draggable
            initialPos={{ top: 5, left: 18 }}
            width={BOX_W}
            height={BOX_H}
            color="orange"
          />
        </Container>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
