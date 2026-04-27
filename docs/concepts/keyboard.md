# Keyboard

Yokai parses raw stdin into structured key events and dispatches them through the focused element.

## Two surfaces

There are two ways to handle keys, with different scopes and shapes:

| API | Where it fires | Event shape |
|---|---|---|
| `useInput((input, key, event) => ...)` | global, every keystroke | `Key` flag bag + raw `input` string |
| `<Box onKeyDown={...}>` | DOM dispatch from focused element up | `KeyboardEvent` (DOM-style) |

`useInput` is for app-level shortcuts. `onKeyDown` is for focusable widgets that should only see keys while focused.

## ParsedKey

`parse-keypress.ts` tokenizes stdin into `ParsedKey`:

```ts
type ParsedKey = {
  name: string         // 'a', 'up', 'return', 'f1', 'tab', 'escape', ...
  sequence: string     // raw bytes ('\x1b[A', '\r', 'a')
  ctrl: boolean
  shift: boolean
  meta: boolean        // Alt on most terms
  option: boolean      // macOS Option
  super: boolean       // Cmd / Win (kitty CSI u only)
  fn: boolean
  code?: string        // CSI final byte for unmapped function keys
}
```

Recognized: arrows, page up/down, home/end, return, tab, backspace, delete, escape, F1–F35, wheel up/down, kitty CSI u, xterm modifyOtherKeys, application keypad mode.

## KeyboardEvent

```ts
class KeyboardEvent extends TerminalEvent {
  type = 'keydown'
  key: string         // 'a', '3', 'ArrowDown', 'Enter', 'Escape', ...
  ctrl: boolean
  shift: boolean
  meta: boolean       // alt OR option
  superKey: boolean
  fn: boolean
}
```

`key` follows browser semantics: literal char for printables (`'a'`, `' '`, `'/'`), multi-char name for special keys (`'down'`, `'return'`). The idiomatic printable check is `e.key.length === 1`.

Bubbles by default. `cancelable: true` — `preventDefault()` suppresses the default action.

## Dispatch and focus

`Ink.dispatchKeyboardEvent(parsedKey)`:

1. Targets `focusManager.activeElement ?? rootNode`.
2. Dispatches via `dispatcher.dispatchDiscrete` (capture + bubble).
3. If the event is not `defaultPrevented` and the key is `tab` (no ctrl/meta), advances focus — `focusPrevious` on shift+tab, `focusNext` otherwise.

Tab cycling is the renderer's built-in default action. To intercept Tab, call `preventDefault()` on the `KeyboardEvent`.

## Key flags (useInput)

`InputEvent` carries a `Key` record with boolean flags: `upArrow`, `downArrow`, `leftArrow`, `rightArrow`, `pageUp`, `pageDown`, `home`, `end`, `return`, `escape`, `tab`, `backspace`, `delete`, `ctrl`, `shift`, `meta`, `super`, `fn`, `wheelUp`, `wheelDown`. The `input` string is the printable text (empty for special keys, the literal char for printables).

```tsx
useInput((input, key) => {
  if (key.escape) close()
  if (input === 'q' && !key.ctrl) quit()
})
```

## See also
- [Events](../concepts/events.md)
- [Focus](../concepts/focus.md)
- [useInput](../hooks/use-input.md)
