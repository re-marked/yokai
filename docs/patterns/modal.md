# Modal Dialog

A floating panel that pulls focus when it opens and restores it on close. Reach for this when an action needs the user's full attention: confirm-destroy prompts, form dialogs, error overlays.

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
import { useEffect, useRef, useState } from 'react'
import { useFocus } from '@yokai/renderer'

function ConfirmModal({
  message,
  onConfirm,
  onCancel,
}: {
  message: string
  onConfirm: () => void
  onCancel: () => void
}): React.ReactNode {
  const { ref, focus } = useFocus()
  // Pull focus into the modal as soon as it mounts. The previous
  // focused element is auto-pushed onto FocusManager's focus stack
  // — when this component unmounts and its tabbables are removed,
  // FocusManager pops the stack and restores focus.
  useEffect(() => {
    focus()
  }, [focus])

  useInput((input, key) => {
    if (key.escape) onCancel()
  })

  return (
    <>
      {/* Backdrop. Absolute, full-viewport, dim color, low zIndex.
          Sits above in-flow content but below the modal panel. */}
      <Box
        position="absolute"
        top={0}
        left={0}
        width="100%"
        height="100%"
        backgroundColor="#000000"
        zIndex={100}
      />

      {/* Panel. Centered via top/left margins; higher zIndex than
          backdrop so it paints over. */}
      <Box
        position="absolute"
        top={6}
        left={20}
        width={44}
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
            <FocusRing
              ref={ref}
              autoFocus
              paddingX={2}
              onClick={onCancel}
            >
              <Text>Cancel</Text>
            </FocusRing>
            <FocusRing paddingX={2} onClick={onConfirm}>
              <Text>OK</Text>
            </FocusRing>
          </FocusGroup>
        </Box>
      </Box>
    </>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<string>('—')

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
    if (input === 'd' && !open) setOpen(true)
  })

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" padding={1}>
        <Text bold>main view</Text>
        <Text dim>press <Text bold>d</Text> to delete, <Text bold>q</Text> to quit</Text>
        <Text>last action: <Text bold>{result}</Text></Text>

        <Box marginTop={1}>
          <FocusGroup direction="column" wrap flexDirection="column">
            <FocusRing paddingX={1}><Text>file 1</Text></FocusRing>
            <FocusRing paddingX={1}><Text>file 2</Text></FocusRing>
            <FocusRing paddingX={1}><Text>file 3</Text></FocusRing>
          </FocusGroup>
        </Box>

        {open && (
          <ConfirmModal
            message="Delete selected file?"
            onConfirm={() => {
              setResult('deleted')
              setOpen(false)
            }}
            onCancel={() => {
              setResult('cancelled')
              setOpen(false)
            }}
          />
        )}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **Mount-time focus pull**: `useEffect(() => focus(), [])` inside the modal grabs focus into the cancel button as soon as the modal renders. The previously-focused element is automatically pushed onto `FocusManager`'s focus stack as part of the focus transition.
2. **Unmount-time focus restore**: when `open` flips to `false`, the modal subtree unmounts. `FocusManager.beforeRemove` detects the active element is gone, pops the focus stack, and restores focus to whichever item in the main list was focused before the modal opened — without the consumer needing to track it.
3. **Backdrop**: an absolute-positioned full-viewport `<Box>` with a dim background color. `zIndex={100}` keeps it above all in-flow content. It's a sibling of the panel, not a parent — both sit in the same render group so their z-order is well-defined.
4. **Panel above backdrop**: `zIndex={101}` puts the panel above the backdrop. `zIndex` only affects `position: 'absolute'` nodes, so both must be absolutely positioned to participate in the stacking.
5. **Escape to cancel**: the modal's own `useInput` catches `key.escape` and calls `onCancel`. The host's `useInput` also runs but doesn't see Escape as a quit key — both fire, both decide independently.
6. **`autoFocus` on cancel**: makes destructive confirmation safer — Enter doesn't immediately commit. The user must explicitly Tab or click to OK.
7. **Inner FocusGroup**: arrow keys cycle between Cancel and OK without affecting the main view's focus group, because `FocusGroup` only handles arrows when focus is inside its own subtree.

## Variations

- **Form modal**: replace the button row with a column of input fields. Move `autoFocus` to the first field. Bind Enter to submit and call `onConfirm` with form values.
- **No backdrop**: drop the backdrop `<Box>` for a lightweight popover that doesn't dim the rest of the screen. Useful for tooltips and command palettes.
- **Click-outside to dismiss**: give the backdrop an `onClick={onCancel}` handler. The panel is a sibling, not a child, so its clicks don't bubble into the backdrop.
- **Imperative focus restore**: if you don't want to rely on the focus stack (e.g. you're moving focus around inside the modal in ways that pollute the stack), capture `useFocusManager().focused` in a ref before opening and call `focus(savedRef.current)` from `onCancel` / `onConfirm`.
- **Stacked modals**: open a modal from inside another modal — focus stack handles arbitrary depth, each unmount pops one frame.

## Related

- [`useFocus`](../hooks/use-focus.md), [`useFocusManager`](../hooks/use-focus-manager.md)
- [`FocusGroup`](../components/focus-group.md), `FocusRing`
- [zIndex behavior](../concepts/layout.md) — only applies to absolute-positioned nodes; per-parent stacking, not global.
