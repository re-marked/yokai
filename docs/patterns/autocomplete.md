# Autocomplete

A text input with a dropdown of suggestions filtered by what the user has typed; arrow keys move through suggestions while typing focus stays in the input. Reach for this when the user picks from a known set but typing is faster than clicking — command palettes, tag pickers, lookup fields.

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
import { useMemo, useState } from 'react'

const ALL_OPTIONS = [
  'apple', 'apricot', 'avocado', 'banana', 'blackberry',
  'blueberry', 'cherry', 'coconut', 'date', 'elderberry',
  'fig', 'grape', 'grapefruit', 'kiwi', 'lemon',
  'lime', 'mango', 'melon', 'orange', 'papaya',
  'peach', 'pear', 'pineapple', 'plum', 'raspberry',
  'strawberry', 'watermelon',
]

function App(): React.ReactNode {
  const { exit } = useApp()
  const { focused, focusNext, focusPrevious, focus, blur } = useFocusManager()

  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState<string | null>(null)
  const [activeIdx, setActiveIdx] = useState(0)
  const [view, setView] = useState<'input' | 'list'>('input')

  const suggestions = useMemo(
    () =>
      query.length === 0
        ? []
        : ALL_OPTIONS.filter((o) => o.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6),
    [query],
  )

  useInput((input, key) => {
    if (key.escape && view === 'list') {
      setView('input')
      return
    }
    if (input === 'q' && view === 'input' && query.length === 0) {
      exit()
      return
    }
    if (key.ctrl && input === 'c') exit()

    if (view === 'input') {
      // Down arrow / Tab: jump from input into the suggestion list.
      if ((key.downArrow || key.tab) && suggestions.length > 0) {
        setView('list')
        setActiveIdx(0)
        return
      }
      // Plain typing.
      if (key.backspace || key.delete) {
        setQuery((q) => q.slice(0, -1))
        return
      }
      if (key.return && suggestions[activeIdx]) {
        setChosen(suggestions[activeIdx])
        setQuery('')
        return
      }
      if (input && !key.ctrl && !key.meta) {
        setQuery((q) => q + input)
        setActiveIdx(0)
      }
      return
    }

    // view === 'list'
    if (key.upArrow) {
      setActiveIdx((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
      return
    }
    if (key.downArrow) {
      setActiveIdx((i) => (i >= suggestions.length - 1 ? 0 : i + 1))
      return
    }
    if (key.return && suggestions[activeIdx]) {
      setChosen(suggestions[activeIdx])
      setQuery('')
      setView('input')
      return
    }
    // Any printable character returns to typing and appends.
    if (input && !key.ctrl && !key.meta) {
      setView('input')
      setQuery((q) => q + input)
      setActiveIdx(0)
    }
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>fruit picker</Text>
        <Text dim>type to search · ↓ enters list · Enter selects · Esc returns to input</Text>

        <Box marginTop={1} borderStyle="single" borderColor={view === 'input' ? 'cyan' : 'gray'} paddingX={1}>
          <Text>
            {query}
            <Text inverse>{view === 'input' ? ' ' : ''}</Text>
          </Text>
        </Box>

        {suggestions.length > 0 && (
          <Box flexDirection="column" marginTop={0}>
            {suggestions.map((s, i) => (
              <Box
                key={s}
                paddingX={1}
                backgroundColor={view === 'list' && i === activeIdx ? 'cyan' : undefined}
              >
                <Text>{s}</Text>
              </Box>
            ))}
          </Box>
        )}

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

1. **No `<TextInput>` component**: yokai doesn't ship one. The "input" is a `<Box>` that renders the current `query` string plus an inverse-video block for the cursor. Typing is handled by `useInput`.
2. **One `useInput` handler, two modes**: `view` is `'input'` or `'list'`. The handler dispatches to one branch or the other based on which view holds focus. This is the conditional-delegation pattern — instead of two competing handlers, one handler routes based on app state.
3. **Down arrow transitions input → list**: pressing ↓ while typing moves "focus" (in app state, not in `FocusManager`) to the suggestion list. The active suggestion gets a cyan background so the user can see where they are.
4. **Any printable key returns to input**: typing while in list mode flips back to input mode and appends to the query. This matches typical autocomplete UX — the keyboard is always live for typing, even after you've moved into the list.
5. **Escape returns to input** without committing. Enter commits whichever suggestion is active and resets state.
6. **Suggestion filtering** is `useMemo`-d off `query`. For larger datasets, swap the in-line `.filter` for a fuzzy matcher or a worker.
7. **Why not `<FocusGroup>` for the list?**: arrow handling needs to know about the input mode too — using `<FocusGroup>` would split the keyboard logic across two places. With one `useInput` handling both modes, the transition rules stay in one spot.

## Variations

- **Use `<FocusGroup>` for the list**: if you want true focus to move into the list (and other tabbables to be reachable from there), wrap the suggestions in `<FocusGroup direction="column" wrap>` with `<FocusRing>` per item. Set `isActive={view === 'list'}` so arrows only move when the list is active. Tab from the input naturally lands in the list's first focusable.
- **Click to select**: give each suggestion an `onClick` that commits the value. The keyboard path still works.
- **Fuzzy matching**: replace `startsWith` with a fuzzy matcher (e.g. fzf-style scoring). Sort the result list by score before slicing.
- **Multi-select**: track `chosen: string[]` instead of `string | null`. Enter pushes; Backspace at empty query pops the last chip. Render chips as a row above the input.
- **Async suggestions**: drive `suggestions` from a `useEffect` that debounces a network call off `query`. Render a "loading…" hint while in flight.
- **Highlight match**: split each suggestion's label at the matched substring and render the matched portion with `<Text bold>`.

## Related

- [`useInput`](../hooks/use-input.md)
- [`useFocusManager`](../hooks/use-focus-manager.md), [`useFocus`](../hooks/use-focus.md)
- [`FocusGroup`](../components/focus-group.md), `FocusRing`
- [Keyboard menu pattern](./keyboard-menu.md) — the list-only case without an input.
