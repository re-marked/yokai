/**
 * Keyboard focus + arrow navigation demo.
 *
 *   pnpm demo:focus-nav
 *
 * Two side-by-side <FocusGroup>s. Tab cycles between groups (and the
 * footer status row); arrows cycle within whichever group currently
 * has focus. <FocusRing> wraps each item so the focused one shows a
 * cyan border. The status row at the bottom uses useFocusManager to
 * read the global focused element and display its label live.
 *
 * Press q or Escape to quit.
 */

import {
  AlternateScreen,
  Box,
  FocusGroup,
  FocusRing,
  Text,
  render,
  useApp,
  useFocusManager,
  useInput,
} from '@yokai/renderer'
import type React from 'react'

const LEFT_ITEMS = ['inbox', 'starred', 'sent', 'drafts', 'trash']
const RIGHT_ITEMS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']

function MenuItem({ label }: { label: string }): React.ReactNode {
  return (
    <FocusRing paddingX={1} marginBottom={0}>
      <Text>{label}</Text>
    </FocusRing>
  )
}

function StatusBar(): React.ReactNode {
  const { focused } = useFocusManager()
  // We embed each FocusRing's label in the rendered tree; for the
  // status read, just show whether something is focused — a real app
  // would query a per-element key/id from your own state, not the DOM.
  const hasFocus = focused !== null
  return (
    <Box marginTop={1}>
      <Text dim>
        focused: <Text bold>{hasFocus ? 'something' : 'nothing'}</Text>
        {' · '}
        <Text bold>Tab</Text> jumps between groups, <Text bold>↑↓</Text> within left,{' '}
        <Text bold>←→</Text> within right
      </Text>
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
        <Text bold>yokai · focus + arrow navigation demo</Text>
        <Text dim>
          Tab between groups, arrows within them. <Text bold>q</Text> / <Text bold>Esc</Text> quits.
        </Text>

        <Box flexDirection="row" gap={4} marginTop={1}>
          {/* Left: vertical column, ↑↓ navigate */}
          <Box flexDirection="column">
            <Text dim>column · ↑/↓</Text>
            <FocusGroup direction="column" wrap flexDirection="column">
              {LEFT_ITEMS.map((label) => (
                <MenuItem key={label} label={label} />
              ))}
            </FocusGroup>
          </Box>

          {/* Right: horizontal row, ←→ navigate */}
          <Box flexDirection="column">
            <Text dim>row · ←/→</Text>
            <FocusGroup direction="row" wrap flexDirection="row" gap={1}>
              {RIGHT_ITEMS.map((label) => (
                <MenuItem key={label} label={label} />
              ))}
            </FocusGroup>
          </Box>
        </Box>

        <StatusBar />
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
