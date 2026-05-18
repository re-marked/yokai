/**
 * `<Window>` demo — showcases the A4 + A18 primitive:
 *   - Multi-window WM (three windows side-by-side)
 *   - Titlebar drag + edge/corner resize, both mutating one rect
 *   - Raise-on-press (click any window to bring it forward)
 *   - Focused/blurred chrome (border color flips per focus)
 *   - Auto-routed keyboard (each window's useInput fires only when
 *     that window is focused — no `isMyWindow` boilerplate)
 *   - Modal dialog with backdrop scrim that blocks peers
 *   - 'q' / Ctrl-C to exit; 'm' to open the modal
 *
 * Run with: `pnpm demo:window`
 */

import {
  AlternateScreen,
  Box,
  type Color,
  Text,
  TerminalSizeContext,
  Window,
  render,
  useApp,
  useInput,
} from '@yokai-tui/renderer'
import type React from 'react'
import { useContext, useState } from 'react'

const WIN_W = 28
const WIN_H = 10

/**
 * A window whose only state is an integer counter. up/down arrows
 * adjust it, but only when this window is focused — the framework
 * derives `isActive` from `WindowFocusContext` so the handler reads
 * "naive" (no `if (focused) ...` gate). That's the A18 promise.
 */
function CounterWindow({
  title,
  initialLeft,
  initialTop,
  borderColor,
}: {
  title: string
  initialLeft: number
  initialTop: number
  borderColor?: Color
}): React.ReactNode {
  const [count, setCount] = useState(0)
  // No `isActive` check — useInput auto-gates by Window focus.
  // Try arrow keys on each window: only the focused one responds.
  useInput((_, key) => {
    if (key.upArrow) setCount((c) => c + 1)
    if (key.downArrow) setCount((c) => c - 1)
    // Wheel events route by HOVER (cursor over this window), not focus
    // — match the OS scroll convention. Try scrolling over each window:
    // each one bumps its own counter.
    if (key.wheelUp) setCount((c) => c + 1)
    if (key.wheelDown) setCount((c) => c - 1)
  })
  return (
    <Window
      title={title}
      initialPos={{ top: initialTop, left: initialLeft }}
      initialSize={{ width: WIN_W, height: WIN_H }}
      borderColor={borderColor ?? 'cyan'}
      showCloseButton={false}
    >
      <Box flexDirection="column" paddingX={1} paddingY={1}>
        <Text dim>arrows / wheel · drag titlebar · resize ↘</Text>
        <Box marginTop={1}>
          <Text bold>count: </Text>
          <Text color="green">{count}</Text>
        </Box>
      </Box>
    </Window>
  )
}

/**
 * Modal dialog. Mounts with `modal=true` → auto-claims focus,
 * renders a backdrop scrim, blocks peer windows. 'y' / 'n' close it.
 */
function ConfirmModal({ onClose }: { onClose: (answer: boolean) => void }): React.ReactNode {
  const size = useContext(TerminalSizeContext)
  const cols = size?.columns ?? 80
  const rows = size?.rows ?? 24
  const MW = 36
  const MH = 7
  const left = Math.max(0, Math.floor((cols - MW) / 2))
  const top = Math.max(0, Math.floor((rows - MH) / 2))
  useInput((input) => {
    if (input === 'y') onClose(true)
    if (input === 'n') onClose(false)
  })
  return (
    <Window
      title="confirm"
      modal
      initialPos={{ top, left }}
      initialSize={{ width: MW, height: MH }}
      borderColor="yellow"
      backdropColor="black"
      resizable={false}
      draggable={false}
    >
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text>Close all the panels?</Text>
        <Box marginTop={1}>
          <Text dim>press </Text>
          <Text bold color="green">
            y
          </Text>
          <Text dim> or </Text>
          <Text bold color="red">
            n
          </Text>
        </Box>
      </Box>
    </Window>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const [windowsOpen, setWindowsOpen] = useState<{ a: boolean; b: boolean; c: boolean }>({
    a: true,
    b: true,
    c: true,
  })
  const [modalOpen, setModalOpen] = useState(false)

  // Global (outside-Window) input handler — fires regardless of which
  // window is focused. Exit + open modal live here. Note that pressing
  // 'm' while the modal is OPEN would route as keyboard event, which
  // — since modal is focused — would also fire in the modal's useInput;
  // we suppress here by ignoring 'm' when modalOpen=true.
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
    if (input === 'm' && !modalOpen) setModalOpen(true)
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%">
        <Box paddingX={1} paddingY={0}>
          <Text>
            <Text dim>yokai </Text>
            <Text bold>window</Text>
            <Text dim> demo · </Text>
            <Text color="cyan">click </Text>
            <Text dim>to focus · </Text>
            <Text color="cyan">drag titlebar </Text>
            <Text dim>to move · </Text>
            <Text color="cyan">corner ↘ </Text>
            <Text dim>to resize · </Text>
            <Text color="yellow">m</Text>
            <Text dim> modal · </Text>
            <Text color="red">q</Text>
            <Text dim> quit</Text>
          </Text>
        </Box>
        {windowsOpen.a && (
          <CounterWindow title="alpha" initialLeft={2} initialTop={3} borderColor="cyan" />
        )}
        {windowsOpen.b && (
          <CounterWindow title="beta" initialLeft={WIN_W + 6} initialTop={3} borderColor="green" />
        )}
        {windowsOpen.c && (
          <CounterWindow
            title="gamma"
            initialLeft={2 * (WIN_W + 4) + 2}
            initialTop={3}
            borderColor="magenta"
          />
        )}
        {modalOpen && (
          <ConfirmModal
            onClose={(answer) => {
              setModalOpen(false)
              if (answer) setWindowsOpen({ a: false, b: false, c: false })
            }}
          />
        )}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
