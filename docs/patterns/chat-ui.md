# Chat UI

A scrollable message list above an input row. Reach for this when building Slack-shaped or claude-corp-shaped conversational interfaces: streaming chat, log viewers with reply, agent transcripts.

## Code

```tsx
import {
  AlternateScreen,
  Box,
  FocusGroup,
  FocusRing,
  ScrollBox,
  Text,
  render,
  useApp,
  useFocusManager,
  useInput,
} from '@yokai/renderer'
import type React from 'react'
import { useState } from 'react'

type Message = {
  id: string
  sender: string
  content: string
  timestamp: string
  expanded?: boolean
}

const COLLAPSE_LINES = 3

function MessageBubble({
  message,
  onToggle,
}: {
  message: Message
  onToggle: (id: string) => void
}): React.ReactNode {
  const lines = message.content.split('\n')
  const truncated = !message.expanded && lines.length > COLLAPSE_LINES
  const shown = truncated ? lines.slice(0, COLLAPSE_LINES).join('\n') : message.content

  return (
    <FocusRing
      paddingX={1}
      label={message.id}
      flexDirection="column"
      marginBottom={1}
      onClick={() => onToggle(message.id)}
    >
      <Box>
        <Text bold color="cyan">{message.sender}</Text>
        <Text dim>  {message.timestamp}</Text>
      </Box>
      <Text>{shown}</Text>
      {truncated && (
        <Text dim>… +{lines.length - COLLAPSE_LINES} more lines (Enter to expand)</Text>
      )}
    </FocusRing>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const { focused } = useFocusManager()
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'm1',
      sender: 'alice',
      content: 'have you seen the new renderer diff?',
      timestamp: '09:14',
    },
    {
      id: 'm2',
      sender: 'bob',
      content:
        'yeah — per-cell ANSI patches.\nmuch tighter than redraw-all.\ni measured 4ms/frame on a streaming log.\nold path was 22ms.',
      timestamp: '09:15',
    },
    {
      id: 'm3',
      sender: 'alice',
      content: 'nice. shipping it?',
      timestamp: '09:16',
    },
  ])

  function send(): void {
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [
      ...prev,
      {
        id: `m${prev.length + 1}`,
        sender: 'you',
        content: text,
        timestamp: new Date().toTimeString().slice(0, 5),
      },
    ])
    setDraft('')
  }

  function toggleExpand(id: string): void {
    setMessages((prev) =>
      prev.map((m) => (m.id === id ? { ...m, expanded: !m.expanded } : m)),
    )
  }

  useInput((input, key) => {
    if (key.ctrl && input === 'c') exit()
    if (key.return) {
      if (focused?.attributes.label) {
        toggleExpand(String(focused.attributes.label))
      } else {
        send()
      }
      return
    }
    if (key.backspace || key.delete) {
      setDraft((d) => d.slice(0, -1))
      return
    }
    if (input && !key.ctrl && !key.meta) setDraft((d) => d + input)
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" height="100%" padding={1}>
        <Box flexGrow={1}>
          <ScrollBox stickyScroll flexDirection="column" width="100%">
            <FocusGroup direction="column" flexDirection="column">
              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onToggle={toggleExpand} />
              ))}
            </FocusGroup>
          </ScrollBox>
        </Box>

        <Box
          borderStyle="round"
          borderColor="cyan"
          paddingX={1}
          marginTop={1}
        >
          <Text>{'> '}</Text>
          <Text>{draft}</Text>
          <Text inverse> </Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **Two-region layout**: outer column with `height="100%"`. The list region uses `flexGrow={1}` to take all leftover space; the input row sits at natural height below it.
2. **`stickyScroll` on `<ScrollBox>`**: when the user is at the bottom, new messages auto-scroll into view. As soon as the user scrolls up, sticky pauses — the viewport stays put while later messages append offscreen, and a manual scroll back to the bottom re-arms sticky.
3. **Per-message focus**: `<FocusGroup direction="column">` claims ↑/↓ to walk between bubbles. Each `<FocusRing>` carries the message id via the `label` attribute so the Enter handler knows which bubble to expand.
4. **Collapsed bubbles**: messages over `COLLAPSE_LINES` truncate visually; the `expanded` flag flips on Enter (when a bubble is focused) or on click. The truncation hint shows the hidden line count.
5. **Enter routing**: the host's `useInput` checks `focused?.attributes.label` first — if a bubble owns focus, Enter expands it; otherwise Enter sends the draft. Same key, two contextual meanings.
6. **Plain-text input**: `useInput` accumulates printable chars into `draft` and handles backspace. The cursor block is a single `<Text inverse> </Text>` — no real cursor, no escape codes to manage.
7. **Streaming**: when content arrives token-by-token, mutate the last message's `content` in state. The frame diff in `log-update.ts` only emits ANSI for the cells whose chars actually changed — appending one token to a long bubble touches a handful of cells, not the whole screen.

## Variations

- **Per-message timestamps on hover**: hide the timestamp by default, show it only on the focused bubble.
- **Threaded replies**: nest a second `<ScrollBox>` inside an expanded bubble for a child thread.
- **Scroll-to-latest button**: when sticky pauses, render a floating absolute-positioned button that calls `scrollBoxRef.current?.scrollToBottom()` and re-arms sticky.
- **Multi-line input**: swap the single-line draft for a wrapping `<Box>` plus Shift+Enter to insert a newline; Enter alone sends.
- **Markdown bubbles**: parse `content` into styled `<Text>` runs (bold, code, links via `<Link>`).
- **Sender colors from a hash**: derive `color` from `hash(sender) % palette.length` so each participant gets a stable hue.

## Related

- [`ScrollBox`](../components/scrollbox.md) — `stickyScroll`, viewport culling, imperative scroll API.
- [`FocusGroup`](../components/focus-group.md), `FocusRing`
- [`useInput`](../hooks/use-input.md), [`useFocusManager`](../hooks/use-focus-manager.md)
- [Modal pattern](./modal.md) — for confirmation prompts (e.g. "delete message?") on top of a chat.
