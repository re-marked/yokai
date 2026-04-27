# Events

Yokai dispatches events through a DOM-style capture + bubble tree, modeled on the browser `Event` API.

## Event types

| Class | Fires on | Bubbles |
|---|---|---|
| `KeyboardEvent` (`'keydown'`) | focused element, then ancestors | yes |
| `ClickEvent` | hit-tested node (left release without drag) | yes |
| `MouseDownEvent` | hit-tested node (any press) | yes |
| `MouseMoveEvent` / `MouseUpEvent` | captured gesture handler only | no |
| `FocusEvent` (`'focus'` / `'blur'`) | focused / blurred node | no |
| `InputEvent` | `useInput` subscribers | n/a |

All events extend `TerminalEvent`, which carries `target`, `currentTarget`, `eventPhase`, `timeStamp`, `defaultPrevented`.

## Capture and bubble

`Dispatcher.dispatch(target, event)` walks from `target` to the root collecting handlers. Capture handlers prepend (root-first), bubble handlers append (target-first):

```
[root-cap, ..., parent-cap, target-cap, target-bub, parent-bub, ..., root-bub]
```

Handlers run in this order. `eventPhase` is `'capturing'`, `'at_target'`, or `'bubbling'`.

## Propagation control

```ts
event.stopPropagation()           // stop after current node finishes
event.stopImmediatePropagation()  // stop now, including remaining handlers on this node
event.preventDefault()            // suppress default action (e.g. Tab cycling on KeyboardEvent)
```

`preventDefault()` only flips `defaultPrevented` if the event is `cancelable`. Tab cycling in `dispatchKeyboardEvent` is gated on `!event.defaultPrevented`.

## Hit testing

`hit-test.ts` resolves `(col, row)` to the deepest rendered DOM element. Iteration matches paint order — children are walked in reverse `(effectiveZ, treeOrder)` so the topmost node wins. Absolute children outside their parent's rect are still hit-tested.

## Dispatch entry points

| Function | Source |
|---|---|
| `dispatcher.dispatchDiscrete(target, event)` | `events/dispatcher.ts` — keyboard, click, focus, paste |
| `dispatcher.dispatchContinuous(target, event)` | `events/dispatcher.ts` — resize, scroll, mousemove |
| `dispatchClick(root, col, row)` | `hit-test.ts` |
| `dispatchMouseDown(root, col, row, button)` | `hit-test.ts` |
| `dispatchHover(root, col, row, hovered)` | `hit-test.ts` |
| `dispatchKeyboardEvent(parsedKey)` | `ink.tsx` — fires from `focusManager.activeElement ?? root` |

Discrete events run inside React's `discreteUpdates` so all state updates batch synchronously.

## See also
- [Mouse](../concepts/mouse.md)
- [Keyboard](../concepts/keyboard.md)
- [Focus](../concepts/focus.md)
