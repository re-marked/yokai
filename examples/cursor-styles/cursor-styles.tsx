/**
 * Cursor styles demo — every (style × blink × color) combination
 * driven by real focusable radios. The TextInput stays focused
 * throughout: clicking a radio toggles its value WITHOUT tearing
 * focus, so the live cursor preview updates in place without
 * blinking out.
 *
 *   pnpm demo:cursor-styles
 *
 * Tab between sections. Arrows within a section. Enter / Space
 * toggles the focused radio. Mouse click toggles too. Type into the
 * TextInput to watch the cursor morph live as you flip the boxes.
 *
 * Press Ctrl+C to quit.
 */

import {
  AlternateScreen,
  Box,
  type Color,
  type CursorStyle,
  FocusGroup,
  Radio,
  Text,
  TextInput,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

type ColorChoice = 'default' | 'red' | 'green' | 'blue' | 'yellow' | 'magenta' | 'cyan' | '#ff8800'

const STYLES: ReadonlyArray<CursorStyle> = ['block', 'underline', 'bar']
const COLORS: ReadonlyArray<ColorChoice> = [
  'default',
  'red',
  'green',
  'blue',
  'yellow',
  'magenta',
  'cyan',
  '#ff8800',
]

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit()
  })

  const [style, setStyle] = useState<CursorStyle>('block')
  const [blink, setBlink] = useState(true)
  const [color, setColor] = useState<ColorChoice>('default')
  const [text, setText] = useState('Type here to see the cursor')

  // Map ColorChoice → the actual prop value (undefined = terminal default).
  const cursorColor: Color | undefined = color === 'default' ? undefined : color

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>yokai · Cursor styles demo</Text>
        <Text dim>
          Tab between sections · Arrows within a section · Enter/Space toggles · Mouse click also
          toggles · Ctrl+C to quit
        </Text>

        <Group label="Style (DECSCUSR shape)">
          <FocusGroup direction="row">
            {STYLES.map((s) => (
              <Radio key={s} current={style} value={s} onChange={setStyle} label={s} paddingX={1} />
            ))}
          </FocusGroup>
        </Group>

        <Group label="Blink (DECSCUSR pair)">
          <FocusGroup direction="row">
            <Radio
              current={blink}
              value={true}
              onChange={setBlink}
              label="blinking"
              paddingX={1}
            />
            <Radio
              current={blink}
              value={false}
              onChange={setBlink}
              label="steady"
              paddingX={1}
            />
          </FocusGroup>
        </Group>

        <Group label="Color (OSC 12)">
          <FocusGroup direction="row">
            {COLORS.map((c) => (
              <Radio key={c} current={color} value={c} onChange={setColor} paddingX={1}>
                <Text color={c === 'default' ? undefined : c}>{` ${c}`}</Text>
              </Radio>
            ))}
          </FocusGroup>
        </Group>

        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text dim>Live preview — type to watch the cursor (focus stays here while you click radios)</Text>
          <TextInput
            value={text}
            onChange={setText}
            borderStyle="round"
            paddingX={1}
            width={60}
            cursorStyle={style}
            cursorBlink={blink}
            cursorColor={cursorColor}
            autoFocus
          />
        </Box>

        <Box flexDirection="column">
          <Text dim>Equivalent props:</Text>
          <Text>
            {`<TextInput cursorStyle="${style}" cursorBlink={${blink}} cursorColor=${
              cursorColor === undefined ? '{undefined}' : `"${cursorColor}"`
            } />`}
          </Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

function Group({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Box flexDirection="column">
      <Text dim>{label}</Text>
      {children}
    </Box>
  )
}

render(<App />)
