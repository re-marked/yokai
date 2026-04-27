# Focus

Yokai tracks one focused DOM element at a time and routes keyboard events through it.

## tabIndex

A node participates in focus when its `tabIndex` is set:

| Value | Behavior |
|---|---|
| `0` or any positive integer | Included in Tab cycling, focusable via click |
| `-1` | Programmatic focus only — skipped by Tab |
| absent | Not focusable; click does not focus |

Tab order matches DOM tree order. `FocusManager.focusNext` and `focusPrevious` walk the tree, collect every node with `tabIndex >= 0`, and advance the index modulo the list length.

## FocusManager

One `FocusManager` per `Ink` root, stored on the root DOM element (like the browser's `ownerDocument`). Get it from any node with `getFocusManager(node)`.

```ts
class FocusManager {
  activeElement: DOMElement | null
  focus(node): void
  blur(): void
  focusNext(root): void
  focusPrevious(root): void
  enable(): void
  disable(): void
  subscribeToFocus(node, listener): () => void  // per-node — used by useFocus
  subscribe(listener): () => void                // global — used by useFocusManager
}
```

`focus()` dispatches a DOM `'blur'` on the previous element and a `'focus'` on the new one, then notifies subscribers.

## Focus stack

When focus moves, the previous element is pushed onto a stack (deduped, capped at 32 entries). On unmount of the focused subtree, `handleNodeRemoved` blurs the active element and walks the stack popping the most recent still-mounted candidate. This restores focus naturally as modals and popovers close.

## Tab cycling

Tab cycling is the default action of `KeyboardEvent`. `Ink.dispatchKeyboardEvent`:

1. Dispatches the `'keydown'` to `activeElement ?? root`.
2. If not `defaultPrevented` and key is `tab` (no ctrl/meta): `focusPrevious` on shift+tab, `focusNext` otherwise.

Tab is global. Arrow-key navigation is opt-in — wrap a region in `<FocusGroup>` to scope arrows or trap focus inside it.

## Click-to-focus

`dispatchClick` walks from the hit node up via `parentNode`, finds the closest ancestor with a numeric `tabIndex`, and calls `focusManager.handleClickFocus(node)`. `handleClickFocus` is a no-op when `tabIndex` is missing — clicks on non-focusable nodes do not steal focus.

## See also
- [Keyboard](../concepts/keyboard.md)
- [FocusGroup](../components/focus-group.md)
- [FocusRing](../components/focus-ring.md)
- [useFocus](../hooks/use-focus.md)
- [useFocusManager](../hooks/use-focus-manager.md)
