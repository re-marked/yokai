/**
 * TextInput demo — single-line, multiline, password, controlled.
 *
 *   pnpm demo:text-input
 *
 * Four text inputs on screen, each demonstrating a different mode.
 * Tab between them; arrow / Home / End / Ctrl+arrow nav within;
 * Backspace / Delete / Ctrl+W / Ctrl+U / Ctrl+K editing; Ctrl+Z /
 * Ctrl+Shift+Z undo/redo. Selection via Shift+arrows or mouse drag.
 *
 * Smart paste: pastes ≤ 32 chars feel like typing (set on the
 * AlternateScreen). Pastes above fire onPaste internally — visible as
 * a single undo step in the inputs.
 *
 * Press Ctrl+C to quit.
 */

import { AlternateScreen, Box, Text, TextInput, render, useApp, useInput } from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit()
  })

  const [name, setName] = useState('')
  const [bio, setBio] = useState(
    'Multiline. Type, paste, undo with Ctrl+Z. Use arrow keys + Home/End.\nLine 2: Ctrl+W deletes a word back; Ctrl+U a line back.',
  )
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)

  return (
    <AlternateScreen mouseTracking pasteThreshold={32}>
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>yokai · TextInput demo</Text>
        <Text dim>
          Tab between fields. Type, paste, undo (Ctrl+Z) / redo (Ctrl+Shift+Z). Ctrl+C to quit.
        </Text>

        <Box flexDirection="column" gap={1}>
          <Field label="Name (controlled, single-line)">
            <TextInput
              value={name}
              onChange={setName}
              placeholder="Type your name…"
              maxLength={40}
              onSubmit={(v) => setSubmitted(`name = ${JSON.stringify(v)}`)}
              borderStyle="round"
              paddingX={1}
              width={50}
            />
          </Field>

          <Field label="Bio (uncontrolled, multiline, Ctrl+Enter to submit)">
            <TextInput
              defaultValue={bio}
              onChange={setBio}
              multiline
              onSubmit={(v) => setSubmitted(`bio = ${JSON.stringify(v.slice(0, 40))}…`)}
              borderStyle="round"
              paddingX={1}
              width={70}
              height={6}
            />
          </Field>

          <Field label="Password (single-line, masked)">
            <TextInput
              value={password}
              onChange={setPassword}
              password
              placeholder="Type a secret…"
              onSubmit={(v) => setSubmitted(`password length = ${v.length}`)}
              borderStyle="round"
              paddingX={1}
              width={50}
            />
          </Field>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text dim>
            name: <Text bold>{JSON.stringify(name)}</Text>
          </Text>
          <Text dim>
            bio length: <Text bold>{bio.length}</Text>
          </Text>
          <Text dim>
            password length: <Text bold>{password.length}</Text>
          </Text>
          {submitted && (
            <Text>
              <Text bold color="green">
                submitted:
              </Text>{' '}
              {submitted}
            </Text>
          )}
        </Box>
      </Box>
    </AlternateScreen>
  )
}

function Field({
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
