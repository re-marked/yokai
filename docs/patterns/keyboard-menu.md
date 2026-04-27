# Keyboard Menu

A vertical list of items navigated with arrow keys, Enter to select. Reach for this when building command palettes, sidebar menus, or any single-column picker.

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
import { useState } from 'react'

const ITEMS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'starred', label: 'Starred' },
  { id: 'sent', label: 'Sent' },
  { id: 'drafts', label: 'Drafts' },
  { id: 'trash', label: 'Trash' },
]

function MenuItem({
  id,
  label,
  onSelect,
}: {
  id: string
  label: string
  onSelect: (id: string) => void
}): React.ReactNode {
  return (
    <FocusRing paddingX={1} label={id}>
      <Text>{label}</Text>
    </FocusRing>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const { focused } = useFocusManager()
  const [chosen, setChosen] = useState<string | null>(null)

  useInput((input, key) => {
    if (input === 'q' || key.escape || (key.ctrl && input === 'c')) exit()
    if (key.return && focused?.attributes.label) {
      setChosen(String(focused.attributes.label))
    }
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>Pick a folder</Text>
        <Text dim>arrows to move, Enter to select, q to quit</Text>

        <Box marginTop={1}>
          <FocusGroup direction="column" wrap flexDirection="column">
            {ITEMS.map((item) => (
              <MenuItem key={item.id} id={item.id} label={item.label} onSelect={setChosen} />
            ))}
          </FocusGroup>
        </Box>

        <Box marginTop={1}>
          <Text>chose: <Text bold>{chosen ?? '—'}</Text></Text>
        </Box>
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. `<FocusGroup direction="column" wrap>` claims ↑/↓ for navigation; `wrap` cycles past the ends so the user never gets stuck.
2. `<FocusRing>` draws a single-line border that turns cyan when its child holds focus. Each ring registers a tabbable node — no separate `tabIndex` needed.
3. The `label` prop on `<FocusRing>` (forwarded to the underlying `<Box>`) tags the node so the Enter handler can identify what was selected.
4. `useFocusManager` exposes the live focused element. The Enter branch in `useInput` reads `focused.attributes.label` to know which item the user committed.
5. Tab still walks every focusable in the tree, independent of the group. Arrow keys stay scoped to the group.
6. Mouse clicks on a `<FocusRing>` also focus it — the keyboard menu doubles as a clickable list with no extra wiring.

## Variations

- **Horizontal menu**: swap to `direction="row"` and lay items out with `flexDirection="row"` — ←/→ then drives navigation.
- **No wrap**: drop `wrap` so arrow-past-end is a hard stop. Matches typical OS menu UX.
- **Disable while modal open**: pass `isActive={false}` to the `<FocusGroup>` to suppress arrow handling without unmounting it.
- **Per-item callbacks**: instead of reading `focused.attributes.label`, store the item id in a ref keyed by the `useFocus` ref and look it up on Enter.
- **Auto-focus first item**: set `autoFocus` on the first `<FocusRing>` so the menu is keyboard-ready immediately.

## Related

- [`FocusGroup`](../components/focus-group.md)
- `FocusRing` — focusable Box with a focus-visible border indicator.
- [`useFocus`](../hooks/use-focus.md), [`useFocusManager`](../hooks/use-focus-manager.md)
- [`useInput`](../hooks/use-input.md)
- Demo: [`examples/focus-nav/focus-nav.tsx`](../../examples/focus-nav/focus-nav.tsx)
