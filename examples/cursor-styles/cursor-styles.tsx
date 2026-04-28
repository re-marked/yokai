/**
 * Cursor styles demo — every (style × blink × color) combination
 * driven by real focusable checkboxes.
 *
 *   pnpm demo:cursor-styles
 *
 * Tab between sections. Arrows within a section. Enter / Space toggles
 * the focused checkbox. Mouse click toggles too. Type into the
 * TextInput at the bottom to watch the cursor morph live as you flip
 * the boxes.
 *
 * Press Ctrl+C to quit.
 */

import {
  AlternateScreen,
  Box,
  type Color,
  type CursorStyle,
  FocusGroup,
  type KeyboardEvent,
  Text,
  TextInput,
  render,
  useApp,
  useFocus,
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

  // Convert ColorChoice → the actual prop value (undefined = terminal default).
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
              <Radio
                key={s}
                current={style}
                value={s}
                onChange={setStyle}
                label={s}
                swatch={swatchFor(s)}
              />
            ))}
          </FocusGroup>
        </Group>

        <Group label="Blink (DECSCUSR pair)">
          <FocusGroup direction="row">
            <Radio current={blink} value={true} onChange={setBlink} label="blinking" />
            <Radio current={blink} value={false} onChange={setBlink} label="steady" />
          </FocusGroup>
        </Group>

        <Group label="Color (OSC 12)">
          <FocusGroup direction="row">
            {COLORS.map((c) => (
              <Radio
                key={c}
                current={color}
                value={c}
                onChange={setColor}
                label={c}
                swatch={c === 'default' ? '·' : '█'}
                swatchColor={c === 'default' ? undefined : c}
              />
            ))}
          </FocusGroup>
        </Group>

        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text dim>Live preview — type to watch the cursor</Text>
          <TextInput
            value={text}
            onChange={setText}
            borderStyle="round"
            paddingX={1}
            width={60}
            cursorStyle={style}
            cursorBlink={blink}
            cursorColor={cursorColor}
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

// ── Primitives ────────────────────────────────────────────────────────

/**
 * Mutually-exclusive checkbox — picks one value from a set, like an
 * HTML radio. `current === value` means "this one is selected." On
 * toggle, the only behavior is "set the parent to my value" (no
 * uncheck — the parent always has SOME value).
 */
// Generic-without-constraint: with `T extends string | boolean`,
// TypeScript widens T to the constraint bound when inferring from
// the props, which then fails to accept `Dispatch<SetStateAction<X>>`
// at the call site. Unconstrained T is fine here — callers always
// pass matching `current` / `value` / `onChange` triples and TS
// happily infers each one.
function Radio<T>({
  current,
  value,
  onChange,
  label,
  swatch,
  swatchColor,
}: {
  current: T
  value: T
  onChange: (v: T) => void
  label: string
  swatch?: string
  swatchColor?: string
}): React.ReactNode {
  const checked = current === value
  return (
    <Toggle
      checked={checked}
      onChange={(c) => {
        // Radio semantics: clicking an already-checked option is a
        // no-op (you can't uncheck without selecting another).
        if (c) onChange(value)
      }}
      label={label}
      swatch={swatch}
      swatchColor={swatchColor}
    />
  )
}

/**
 * Single boolean checkbox. The whole row is the focusable element so
 * a click anywhere on `[ ] label` toggles, not just on the bracket
 * glyph. Shows focus chrome via a left-margin caret indicator.
 */
function Toggle({
  checked,
  onChange,
  label,
  swatch,
  swatchColor,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  swatch?: string
  swatchColor?: string
}): React.ReactNode {
  const { ref, isFocused } = useFocus()
  const onKeyDown = (e: KeyboardEvent): void => {
    // 'return' = Enter, ' ' = Space. Both are the conventional toggle
    // keys on a checkbox. preventDefault so FocusGroup's arrow nav
    // doesn't see us steal focus on Enter (it doesn't anyway, but
    // belt-and-suspenders).
    if (e.key === 'return' || e.key === ' ') {
      e.preventDefault()
      onChange(!checked)
    }
  }
  return (
    <Box
      ref={ref}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={onKeyDown}
      paddingX={1}
    >
      <Text color={isFocused ? 'cyan' : undefined} bold={isFocused}>
        {`${isFocused ? '▸ ' : '  '}[${checked ? 'x' : ' '}] `}
      </Text>
      {swatch !== undefined && (
        <Text color={swatchColor as Color | undefined}>{`${swatch} `}</Text>
      )}
      <Text color={isFocused ? 'cyan' : undefined} bold={isFocused}>
        {label}
      </Text>
    </Box>
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

// Visual swatch glyphs for cursor styles — tiny ASCII analogs of
// what each shape looks like on the terminal.
function swatchFor(style: CursorStyle): string {
  if (style === 'block') return '█'
  if (style === 'underline') return '_'
  return '|' // bar
}

render(<App />)
