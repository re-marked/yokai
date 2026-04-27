# Events reference

Every event class dispatched by yokai, with shape, propagation behavior, and trigger.

All events extend a common base. Two base classes exist:

| Base | Source | Purpose |
|------|--------|---------|
| `Event` | `events/event.ts` | Minimal: `stopImmediatePropagation()` only. Used by mouse/click/input events that don't go through the DOM dispatcher. |
| `TerminalEvent extends Event` | `events/terminal-event.ts` | DOM-style: `target`, `currentTarget`, `eventPhase`, `bubbles`, `cancelable`, `timeStamp`, `stopPropagation()`, `preventDefault()`. Used by `KeyboardEvent`, `FocusEvent`. |

## Common methods

| Method | Available on | Effect |
|--------|--------------|--------|
| `stopImmediatePropagation()` | All events | Halts further handler invocation, including remaining handlers on the same node. |
| `stopPropagation()` | `TerminalEvent` subclasses | Halts after current node finishes; sibling handlers on the same node still fire. |
| `preventDefault()` | `TerminalEvent` subclasses (when `cancelable`) | Sets `defaultPrevented`. The dispatcher's return value (`!defaultPrevented`) reports it; default actions are subclass-specific. |

## ClickEvent

Left-button release without intervening drag. Source: `events/click-event.ts`.

| Field | Type | Description |
|-------|------|-------------|
| `col` | `number` | 0-indexed screen column of the click. |
| `row` | `number` | 0-indexed screen row. |
| `localCol` | `number` | `col - box.x` for the current handler's Box. Recomputed before each handler. |
| `localRow` | `number` | `row - box.y` for the current handler's Box. |
| `cellIsBlank` | `boolean` | True when the clicked cell has no painted content. Use to ignore clicks on empty whitespace right of text. |

**Methods**: `stopImmediatePropagation()`.

**Fires when**: left mouse release without drag motion, while mouse tracking is active (i.e. inside `<AlternateScreen mouseTracking>`).

**Propagation**: bubbles from deepest hit node up via `parentNode`. No capture phase.

## MouseDownEvent

Mouse press over an element. Source: `events/mouse-event.ts`.

Inherits from internal `MouseEvent` base.

| Field | Type | Description |
|-------|------|-------------|
| `col` | `number` | 0-indexed press column. |
| `row` | `number` | 0-indexed press row. |
| `button` | `number` | Raw SGR button byte. Low 2 bits = button (0 left, 1 mid, 2 right). Motion bit (0x20) masked off. |
| `shiftKey` | `boolean` (getter) | `(button & 0x04) !== 0`. |
| `altKey` | `boolean` (getter) | `(button & 0x08) !== 0`. |
| `ctrlKey` | `boolean` (getter) | `(button & 0x10) !== 0`. |
| `localCol` | `number` | Press column relative to current handler's Box. |
| `localRow` | `number` | Press row relative to current handler's Box. |

**Methods**:

- `stopImmediatePropagation()`.
- `captureGesture(handlers: GestureHandlers): void` — claim subsequent mouse-motion events and the eventual release for this drag. After capture, motion routes to `handlers.onMove` even when the cursor leaves the originally pressed element; release fires `handlers.onUp` and clears the capture. The normal release path (onClick, selection finish) is skipped for that release. Selection extension is suppressed for the gesture's lifetime. Calling multiple times within one dispatch overwrites — last call wins. Cannot be retargeted mid-flight.

**Fires when**: mouse press, while mouse tracking is active.

**Propagation**: bubbles from deepest hit node up via `parentNode`.

## MouseMoveEvent

Mouse motion during a captured gesture. Source: `events/mouse-event.ts`.

Same fields as `MouseDownEvent` (`col`, `row`, `button`, modifier getters). No `localCol`/`localRow`, no `captureGesture`.

**Methods**: `stopImmediatePropagation()`.

**Fires when**: mouse moves, after a `MouseDownEvent` handler called `event.captureGesture(...)`. Typically one event per cell crossed.

**Propagation**: does NOT bubble through the DOM tree. Routes directly to the gesture handler installed via `MouseDownEvent.captureGesture`. The active gesture lives on `App.activeGesture`.

## MouseUpEvent

Mouse release that closes a captured gesture. Source: `events/mouse-event.ts`.

Same fields as `MouseMoveEvent`. The `(col, row)` at release identifies the drop position.

**Methods**: `stopImmediatePropagation()`.

**Fires when**: next mouse release after a captured `MouseDownEvent` gesture started. Fires exactly once and clears the capture. Also drained on `FOCUS_OUT` and lost-release recovery so that aborted drags can't leave a dangling handler.

**Propagation**: does NOT bubble. Routes directly to the captured `onUp`.

## GestureHandlers

Type passed to `MouseDownEvent.captureGesture`.

```ts
type GestureHandlers = {
  onMove?: (event: MouseMoveEvent) => void
  onUp?: (event: MouseUpEvent) => void
}
```

## KeyboardEvent

Bubbling key event, follows browser `KeyboardEvent` semantics. Source: `events/keyboard-event.ts`. Extends `TerminalEvent`.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'keydown'` | Always `'keydown'`. |
| `key` | `string` | Literal char for printable keys (`'a'`, `'3'`, `' '`, `'/'`); multi-char name for special keys (`'down'`, `'return'`, `'escape'`, `'f1'`). The idiomatic printable check is `e.key.length === 1`. |
| `ctrl` | `boolean` | Ctrl held. |
| `shift` | `boolean` | Shift held. |
| `meta` | `boolean` | Meta or Option/Alt held. |
| `superKey` | `boolean` | Super (Cmd / Win key). Only delivered via kitty keyboard protocol CSI u sequences. |
| `fn` | `boolean` | Fn key held. |
| `bubbles` | `true` | Inherited. |
| `cancelable` | `true` | Inherited. |
| `target`, `currentTarget`, `eventPhase`, `timeStamp`, `defaultPrevented` | inherited from `TerminalEvent` | |

**Methods**: `stopPropagation()`, `stopImmediatePropagation()`, `preventDefault()`.

**Fires when**: each parsed keypress on stdin, dispatched at the focused element (or the root when nothing is focused).

**Propagation**: capture from root → target, then bubble target → root. Bound via `onKeyDown` / `onKeyDownCapture` props on `<Box>`.

## FocusEvent

Component focus change. Source: `events/focus-event.ts`. Extends `TerminalEvent`.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'focus' \| 'blur'` | `'focus'` on the newly focused node; `'blur'` on the previously focused node. |
| `relatedTarget` | `EventTarget \| null` | The other side of the focus transition. |
| `bubbles` | `true` | Matches react-dom's focusin/focusout — parents observe descendant focus changes. |
| `cancelable` | `false` | `preventDefault()` is a no-op. |

**Methods**: `stopPropagation()`, `stopImmediatePropagation()`.

**Fires when**: focus moves between elements via `useFocusManager`, `<FocusGroup>` arrow nav, `<Tab>`, or imperative `focus()`.

**Propagation**: capture, then bubble. Bound via `onFocus` / `onFocusCapture` / `onBlur` / `onBlurCapture`.

## InputEvent

Lower-level keypress wrapper used by `useInput`. Source: `events/input-event.ts`. Extends `Event` (not `TerminalEvent`).

| Field | Type | Description |
|-------|------|-------------|
| `keypress` | `ParsedKey` | Raw parsed-keypress shape from `parse-keypress.ts`. |
| `key` | `Key` | Bag of booleans (see below). |
| `input` | `string` | Printable text payload, if any. Empty string for special keys. |

**Methods**: `stopImmediatePropagation()`.

**Fires when**: each parsed keypress, before `KeyboardEvent` dispatch. Delivered to `useInput(handler)` subscribers.

**Propagation**: not DOM-routed. Subscriber list runs in registration order.

### Key

Booleans on `InputEvent.key`. Source: `events/input-event.ts`.

| Field | Trigger |
|-------|---------|
| `upArrow`, `downArrow`, `leftArrow`, `rightArrow` | Arrow keys. |
| `pageUp`, `pageDown` | PgUp / PgDn. |
| `wheelUp`, `wheelDown` | Mouse wheel scroll (when mouse tracking active). |
| `home`, `end` | Home / End. |
| `return` | Enter. |
| `escape` | Esc. |
| `tab` | Tab. |
| `backspace`, `delete` | Backspace / Delete. |
| `ctrl`, `shift`, `meta`, `super`, `fn` | Modifier flags. `meta` covers Alt/Option; `super` covers Cmd/Win (kitty protocol only). |

## TerminalFocusEvent

Terminal window focus change via DECSET 1004 reporting. Source: `events/terminal-focus-event.ts`. Extends `Event`.

| Field | Type | Description |
|-------|------|-------------|
| `type` | `'terminalfocus' \| 'terminalblur'` | Window-level focus state. |

**Methods**: `stopImmediatePropagation()`.

**Fires when**: terminal sends `CSI I` (focus, `\x1b[I`) or `CSI O` (blur, `\x1b[O`). Requires DECSET 1004 enabled — typically inside `<AlternateScreen>` or via `useTerminalFocus`.

**Propagation**: not DOM-routed. Delivered via `useTerminalFocus`.

## PasteEvent

Bracketed-paste payload. Source: `events/paste-event.ts`. Extends `Event`.

| Field | Type | Description |
|-------|------|-------------|
| `text` | `string` | Pasted text, with bracket markers stripped. |

**Methods**: `stopImmediatePropagation()`.

**Fires when**: terminal sends a bracketed-paste sequence (`\x1b[200~ … \x1b[201~`).

**Propagation**: bound on `<Box>` via `onPaste` / `onPasteCapture`. Capture then bubble through the focused subtree.

## ResizeEvent

Terminal resize. Source: `events/resize-event.ts`. Extends `Event`.

| Field | Type | Description |
|-------|------|-------------|
| `columns` | `number` | New terminal column count. |
| `rows` | `number` | New terminal row count. |

**Methods**: `stopImmediatePropagation()`.

**Fires when**: SIGWINCH on the controlling stdout. Bound via `onResize` on `<Box>` (bubble only) or read reactively via `useTerminalViewport`.

**Propagation**: bubble only.

## Dispatcher and priority

The dispatcher (`events/dispatcher.ts`) collects listeners in capture-then-bubble order, walking `parentNode` from target to root. Capture handlers are unshifted (root first), bubble handlers appended (target first).

Event types map to React scheduling priorities:

| Priority | Events |
|----------|--------|
| Discrete (sync) | `keydown`, `keyup`, `click`, `focus`, `blur`, `paste` |
| Continuous | `resize`, `scroll`, `mousemove` |
| Default | everything else |

## Handler props on `<Box>`

Source: `events/event-handlers.ts`.

| Prop | Phase | Event |
|------|-------|-------|
| `onKeyDown` / `onKeyDownCapture` | bubble / capture | `KeyboardEvent` |
| `onFocus` / `onFocusCapture` | bubble / capture | `FocusEvent` |
| `onBlur` / `onBlurCapture` | bubble / capture | `FocusEvent` |
| `onPaste` / `onPasteCapture` | bubble / capture | `PasteEvent` |
| `onResize` | bubble | `ResizeEvent` |
| `onClick` | bubble | `ClickEvent` |
| `onMouseDown` | bubble | `MouseDownEvent` |
| `onMouseEnter`, `onMouseLeave` | — | `() => void` (no event arg) |
