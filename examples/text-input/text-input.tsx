/**
 * TextInput demo — soft-wrap edition.
 *
 *   pnpm demo:text-input
 *
 * Five text inputs covering every prop the soft-wrap work added:
 *
 *   - Name      single-line. wrap='none' default (h-scroll past width).
 *   - Bio       multiline. wrap='soft' default + hanging indent. Type
 *               past the right edge to watch lines wrap onto
 *               continuation rows; ↓/↑ walk visual rows including the
 *               wraps. Indented bullets show the hanging-indent
 *               decoration aligning continuations under the first
 *               non-whitespace char.
 *   - Command   multiline + wordBoundaries='identifier'. Wraps prefer
 *               break points inside snake_case / kebab-case names AND
 *               at camelCase transitions. URLs stay atomic.
 *   - Mentions  multiline + wrapHints. Programmatic atomic spans —
 *               @toast and chit-abc-123 stay together even when the
 *               surrounding text would otherwise break inside them.
 *               Hints are hardcoded against the initial value's char
 *               positions; a real app would derive them from a parser.
 *   - Password  single-line, masked. wrap='none' default (h-scroll).
 *
 * Tab between fields. Editing: type, Backspace, Delete, Ctrl+W (word
 * back), Ctrl+U / Ctrl+K (line back / fwd), Ctrl+Z / Ctrl+Shift+Z
 * (undo/redo). Selection: Shift+arrows or mouse drag — multi-row
 * selections paint as one continuous stripe.
 *
 * Smart paste: pastes ≤ 32 chars feel like typing (set on the
 * AlternateScreen). Pastes above fire onPaste internally — visible as
 * a single undo step in the inputs.
 *
 * Press Ctrl+C to quit.
 */

import {
  AlternateScreen,
  Box,
  Text,
  TextInput,
  type WrapHint,
  render,
  useApp,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useMemo, useState } from 'react'

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit()
  })

  const [name, setName] = useState('')
  const [bio, setBio] = useState(
    'Multiline soft-wrap. Long lines wrap onto continuation rows; ↓/↑ walk visual rows including wraps.\n  * Hanging indent: continuation rows of an indented line align under the first non-whitespace char.\nShift+arrow extends selection across rows as one continuous stripe.',
  )
  const [command, setCommand] = useState(
    '/sling --target=backend-engineer --chit=chit-abc-123 --link=https://github.com/foo/bar',
  )
  const [mentions, setMentions] = useState(
    '@toast and chit-abc-123 — please review wrap-math',
  )
  const [password, setPassword] = useState('')
  const [submitted, setSubmitted] = useState<string | null>(null)

  // Memoize the wrap-hints array reference. The TextInput's layout
  // useMemo includes wrapHints as a dep — passing a fresh array every
  // render forces a layout recompute. Stable ref keeps the layout
  // cached across re-renders that don't change the buffer.
  // Indices match the INITIAL value above; if you edit the field,
  // the hints don't track. A real app would derive hints from a
  // parser running on state.value.
  const mentionHints = useMemo<ReadonlyArray<WrapHint>>(
    () => [
      { start: 0, end: 6 }, // @toast
      { start: 11, end: 23 }, // chit-abc-123
    ],
    [],
  )

  return (
    <AlternateScreen mouseTracking pasteThreshold={32}>
      <Box flexDirection="column" padding={1} gap={1}>
        <Text bold>yokai · TextInput demo (soft-wrap edition)</Text>
        <Text dim>
          Tab between fields. Type, paste, undo (Ctrl+Z) / redo (Ctrl+Shift+Z). Ctrl+C to quit.
        </Text>

        <Box flexDirection="column" gap={1}>
          <Field label="Name (single-line — wrap='none' default; h-scroll past width)">
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

          <Field label="Bio (multiline — wrap='soft' default; hanging indent on continuations)">
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

          <Field label="Command (multiline + wordBoundaries='identifier' — breaks at -/_/camelCase, URLs atomic)">
            <TextInput
              defaultValue={command}
              onChange={setCommand}
              multiline
              wordBoundaries="identifier"
              onSubmit={(v) => setSubmitted(`command = ${JSON.stringify(v.slice(0, 40))}…`)}
              borderStyle="round"
              paddingX={1}
              width={40}
              height={4}
            />
          </Field>

          <Field label="Mentions (multiline + wrapHints — @toast and chit-abc-123 stay atomic)">
            <TextInput
              defaultValue={mentions}
              onChange={setMentions}
              multiline
              wrapHints={mentionHints}
              onSubmit={(v) => setSubmitted(`mentions = ${JSON.stringify(v.slice(0, 40))}…`)}
              borderStyle="round"
              paddingX={1}
              width={28}
              height={4}
            />
          </Field>

          <Field label="Password (single-line, masked — h-scroll default)">
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
            command length: <Text bold>{command.length}</Text>
          </Text>
          <Text dim>
            mentions length: <Text bold>{mentions.length}</Text>
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
