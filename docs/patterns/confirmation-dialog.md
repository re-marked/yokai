# Confirmation Dialog

A modal with two or three buttons that returns a discrete answer. Reach for this when an action is destructive, irreversible, or otherwise needs explicit consent: file deletion, force-push, sign-out.

## Code

```tsx
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
import { useCallback, useEffect, useRef, useState } from 'react'

type Answer = 'yes' | 'no' | 'cancel'

function ConfirmDialog({
  message,
  onAnswer,
}: {
  message: string
  onAnswer: (answer: Answer) => void
}): React.ReactNode {
  const { focused } = useFocusManager()

  useInput((input, key) => {
    if (key.escape) {
      onAnswer('cancel')
      return
    }
    if (key.return) {
      const label = focused?.attributes.label
      if (label === 'yes' || label === 'no' || label === 'cancel') {
        onAnswer(label)
      }
    }
  })

  return (
    <>
      <Box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="#000000"
        zIndex={100}
      />
      <Box
        position="absolute"
        top={5}
        left={18}
        width={48}
        height={9}
        backgroundColor="#1a1a3a"
        borderStyle="round"
        borderColor="cyan"
        flexDirection="column"
        padding={1}
        zIndex={101}
      >
        <Text bold>Confirm</Text>
        <Text>{message}</Text>

        <Box marginTop={1}>
          <FocusGroup direction="row" wrap flexDirection="row" gap={2}>
            <FocusRing paddingX={2} label="yes" onClick={() => onAnswer('yes')}>
              <Text>Yes</Text>
            </FocusRing>
            <FocusRing paddingX={2} label="no" onClick={() => onAnswer('no')}>
              <Text>No</Text>
            </FocusRing>
            <FocusRing
              autoFocus
              paddingX={2}
              label="cancel"
              onClick={() => onAnswer('cancel')}
            >
              <Text>Cancel</Text>
            </FocusRing>
          </FocusGroup>
        </Box>
      </Box>
    </>
  )
}

// Promise-based API. Wires a single dialog into a host component
// and returns a function that resolves with the user's choice.
function useConfirm(): {
  node: React.ReactNode
  confirm: (message: string) => Promise<Answer>
} {
  const [pending, setPending] = useState<{
    message: string
    resolve: (a: Answer) => void
  } | null>(null)
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  const confirm = useCallback((message: string): Promise<Answer> => {
    return new Promise<Answer>((resolve) => {
      setPending({ message, resolve })
    })
  }, [])

  const node = pending ? (
    <ConfirmDialog
      message={pending.message}
      onAnswer={(answer) => {
        pending.resolve(answer)
        setPending(null)
      }}
    />
  ) : null

  return { node, confirm }
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const { node: dialog, confirm } = useConfirm()
  const [last, setLast] = useState<string>('—')

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
    if (input === 'd' && !dialog) {
      void (async () => {
        const answer = await confirm('Delete file foo.ts?')
        setLast(answer)
      })()
    }
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>files</Text>
        <Text dim>press <Text bold>d</Text> to delete, <Text bold>q</Text> to quit</Text>
        <Text>last answer: <Text bold>{last}</Text></Text>
        {dialog}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **Three labelled buttons in a row**: `<FocusGroup direction="row">` claims ←/→. Each `<FocusRing>` carries its answer via `label` so the Enter handler can dispatch off the focused element with no per-button refs.
2. **`autoFocus` on the safe default**: Cancel mounts focused, so a reflexive Enter doesn't perform the destructive action. For non-destructive prompts ("Save changes?") `autoFocus` would move to Yes instead.
3. **Esc cancels universally**: the dialog's own `useInput` catches `key.escape` and resolves with `'cancel'`. The host's `useInput` runs in parallel but treats Esc as a no-op while the dialog is mounted.
4. **Modal stacking**: full-viewport backdrop at `zIndex={100}`, panel at `zIndex={101}`. Both must be `position: 'absolute'` — `zIndex` is silently ignored on in-flow nodes.
5. **Promise-based `useConfirm`**: holds a single `{ message, resolve }` pending slot in state. `confirm(message)` returns a `Promise<Answer>`; mounting the `<ConfirmDialog>` is a side effect of that state. `onAnswer` resolves the promise and clears the slot, which unmounts the dialog.
6. **Focus stack on unmount**: when the dialog unmounts, `FocusManager` pops the focus stack and restores the host's previously-focused element — the consumer never has to track who had focus before opening.
7. **Click also dispatches**: each `<FocusRing>` has `onClick` wired to the same answer, so mouse clicks bypass the keyboard and resolve directly.

## Variations

- **Yes / No only**: drop the Cancel button and treat Esc as No. Two-button confirmations are common for binary save prompts.
- **Destructive styling**: color the Yes button red (`<Text color="red" bold>Yes</Text>`) when the action is irreversible.
- **Typed confirmation**: replace the button row with a text input that requires the user to type the resource name before Yes enables. Good for force-pushes and DROP TABLE prompts.
- **Countdown auto-cancel**: render a second `<Text>` below the buttons showing seconds until auto-cancel; a `useEffect` + `setTimeout` resolves with `'cancel'` if no answer arrives.
- **Stacked confirms**: `confirm()` is reentrant in spirit but the `useConfirm` hook above only holds one pending answer at a time. For nested confirms inside a confirm, store an array of pending entries instead and render the top of the stack.

## Related

- [Modal pattern](./modal.md) — base layer this builds on.
- [`FocusGroup`](../components/focus-group.md), `FocusRing`
- [`useFocusManager`](../hooks/use-focus-manager.md), [`useInput`](../hooks/use-input.md)
