# Accessibility

How to build yokai apps that work for users on screen readers, screen magnifiers, and keyboard-only input.

Terminal UIs sit outside the assistive-tech stack that web apps inherit for free. There is no DOM accessibility tree, no ARIA, no role announcements. The TUI is a grid of cells; what reaches a screen reader is whatever the terminal emulator chooses to surface. Designing for accessibility in yokai means designing the surface itself.

## Screen-reader and magnifier support

By default, yokai hides the native terminal cursor while the app is mounted. Screen magnifiers and some screen readers track the cursor position to follow user focus, so hiding it breaks them.

Set `CLAUDE_CODE_ACCESSIBILITY=1` (or `true`) in the environment to keep the native cursor visible. Source: `packages/renderer/src/components/App.tsx`.

```bash
CLAUDE_CODE_ACCESSIBILITY=1 node app.js
```

Behavior with the flag set:

| Aspect | Default | Accessibility mode |
|--------|---------|--------------------|
| Native cursor | Hidden | Visible |
| Cursor position | Undefined | Tracks `useDeclaredCursor` |
| Mouse events | Captured | Captured |

Pair this with [`useDeclaredCursor`](../hooks/use-declared-cursor.md) so the cursor lands on the focused input or the active item — that is the position the magnifier zooms to and the reader reads from.

```tsx
import { useDeclaredCursor } from '@yokai/renderer'

function Prompt({ value, caret }: { value: string; caret: number }) {
  useDeclaredCursor({ row: 0, col: caret })
  return <Text>{value}</Text>
}
```

## Keyboard-first interaction

Treat the mouse as optional. Every interaction must have a keyboard equivalent.

- Tab / Shift+Tab move focus between focusable elements. See [concepts/focus](../concepts/focus.md).
- Arrow keys move focus inside a [`<FocusGroup>`](../components/focus-group.md).
- Enter / Space activate the focused element.
- Escape cancels modals, closes menus, returns focus to the previous landmark.

```tsx
import { FocusGroup, useFocus } from '@yokai/renderer'

function Item({ label }: { label: string }) {
  const { isFocused } = useFocus()
  return (
    <Box borderStyle={isFocused ? 'single' : undefined} paddingX={1}>
      <Text>{label}</Text>
    </Box>
  )
}

function List() {
  return (
    <FocusGroup orientation="vertical">
      <Item label="One" />
      <Item label="Two" />
      <Item label="Three" />
    </FocusGroup>
  )
}
```

## Focus visibility

Every focusable element needs a visible focus indicator. A sighted user navigating by keyboard cannot see a mouse hover state, so focus must be unambiguous.

Two patterns:

```tsx
// 1. FocusRing — wraps the child and applies a border when focused
import { FocusRing } from '@yokai/renderer'

<FocusRing>
  <Button onClick={submit}>Submit</Button>
</FocusRing>

// 2. Manual — read isFocused from useFocus and style yourself
const { isFocused } = useFocus()
<Box backgroundColor={isFocused ? 'blue' : undefined}>...</Box>
```

See [`<FocusRing>`](../components/focus-ring.md).

## Skip-to-content and landmark navigation

Long screens force keyboard users to tab past every element. Provide landmarks and a way to jump to them.

```tsx
import { useFocusManager, useFocus } from '@yokai/renderer'

function App() {
  const main = useFocus({ id: 'main' })
  const sidebar = useFocus({ id: 'sidebar' })
  const { focus } = useFocusManager()

  useInput((input, key) => {
    if (key.alt && input === '1') focus('main')
    if (key.alt && input === '2') focus('sidebar')
  })
  // ...
}
```

Document the landmark shortcuts somewhere the user can find them — a help overlay bound to `?` is the convention.

## Color contrast and color-only signals

Terminal themes vary wildly (light, dark, high-contrast, custom palettes). A color you picked on a dark background may be illegible on a light one.

Rules:

- Never encode meaning in color alone. Pair with bold, underline, or a glyph difference.
- Avoid hex / RGB colors when a named ANSI color works; users remap named colors to fit their theme.
- Test on at least one light and one dark theme.

```tsx
// Bad — error state encoded only in color
<Text color="red">{message}</Text>

// Good — color plus glyph plus bold
<Text color="red" bold>{`✗ ${message}`}</Text>
```

## Hover affordances do not exist

Yokai does not emit OSC 22 (mouse cursor shape changes). The terminal emulator owns the pointer; there is no way to say "this region is interactive, show a hand cursor here." Affordances must be visual chrome — a border, a background tint, a leading glyph — that is present without hovering.

## No ARIA equivalent

The yokai DOM-like tree (`Box`, `Text`, etc.) drives layout. It does not feed an accessibility tree. There is no `role`, no `aria-label`, no live region. Anything you want a screen reader to announce has to be in the visible cell grid.

Practical implication: when state changes silently (a background job finishes, a notification arrives), surface it visibly in a position the user is likely to be reading. A toast in the corner is invisible if the user's attention — and their magnifier — is elsewhere.

## Native cursor placement

The native terminal cursor is the closest thing to a "current position" hint that assistive tech can follow. Use [`useDeclaredCursor`](../hooks/use-declared-cursor.md) to place it on:

- The caret in a text input (essential for IME composition popups).
- The currently selected list item.
- The active cell in a grid.

Without this, the cursor sits wherever the last write left it — usually the bottom-right corner — and a magnifier user sees nothing useful.

## Shipping checklist

- [ ] App reads and respects `CLAUDE_CODE_ACCESSIBILITY`.
- [ ] Every interactive element is reachable by Tab or arrow keys.
- [ ] Every focusable element has a visible focus indicator.
- [ ] No state is encoded in color alone.
- [ ] Tested on a light theme and a dark theme.
- [ ] `useDeclaredCursor` placed at the logical input position.
- [ ] Keyboard shortcuts documented in an in-app help overlay.
- [ ] Background state changes surface visibly, not silently.
- [ ] Modal traps focus and restores it on dismiss.
- [ ] Text inputs work with IME (cursor placement correct during composition).

## See also

- [concepts/focus](../concepts/focus.md)
- [components/focus-group](../components/focus-group.md)
- [components/focus-ring](../components/focus-ring.md)
- [hooks/use-focus](../hooks/use-focus.md)
- [hooks/use-focus-manager](../hooks/use-focus-manager.md)
- [hooks/use-declared-cursor](../hooks/use-declared-cursor.md)
- [concepts/keyboard](../concepts/keyboard.md)
- [concepts/colors](../concepts/colors.md)
