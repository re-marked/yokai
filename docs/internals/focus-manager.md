# Focus Manager

DOM-like focus coordinator: tracks `activeElement`, a focus stack for restoration, and per-node + global subscribers.

## Responsibility

Owns focus state (`activeElement`, focus stack), tab-order traversal (`focusNext` / `focusPrevious`), restoration on node removal, click-to-focus dispatch, autoFocus handling, and listener notification. Does NOT own the focus visual (`<FocusRing>` is a consumer), keyboard event routing (the dispatcher routes; this just decides what `activeElement` is), or per-`useFocus` React state (hooks subscribe and re-render themselves).

## Why on the root DOM element

`FocusManager` is stored on the `ink-root` `DOMElement`. Any node reaches it by walking `parentNode` to the root — analogous to browser `node.ownerDocument`. The two helpers:

```
getRootNode(node)      → walks parentNode until focusManager is set
getFocusManager(node)  → getRootNode(node).focusManager!
```

Source: `focus.ts:239-254`. This avoids passing the manager through React context (which would force re-renders on focus change for every consumer of the context).

## Key types

| Symbol | Source | Purpose |
|---|---|---|
| `FocusManager` | `focus.ts:15` | Class. One instance per ink-root. |
| `activeElement: DOMElement | null` | `:16` | Currently focused node, or null. |
| `focusStack: DOMElement[]` | `:19` | LRU history of previously-focused nodes for restoration. Bounded at `MAX_FOCUS_STACK = 32`. |
| `nodeListeners: Map<DOMElement, Set<Listener>>` | `:26` | Per-node focus subscribers (used by `useFocus`). |
| `globalListeners: Set<() => void>` | `:31` | Any-focus-change subscribers (used by `useFocusManager`). |
| `MAX_FOCUS_STACK = 32` | `:4` | Stack depth cap. Tab cycling dedupes (push removes prior occurrence first), so the cap protects against pathological churn rather than normal cycling. |

## Public API

| Method | Source | Purpose |
|---|---|---|
| `focus(node)` | `:87` | Make `node` the active element. No-op if already active or `enabled === false`. Pushes previous active onto stack (deduped). Dispatches `blur` on previous, `focus` on new, then notifies node listeners (previous → false, new → true) then global. |
| `blur()` | `:110` | Drop focus to null. Dispatches `blur`, notifies. |
| `focusNext(root)` | `:177` | Move to next tabbable in document order. |
| `focusPrevious(root)` | `:181` | Move to previous tabbable. |
| `handleNodeRemoved(node, root)` | `:125` | React removal hook — removes node + descendants from stack, blurs if active, restores most recent still-mounted from stack. |
| `handleAutoFocus(node)` | `:159` | Called by reconciler `commitMount` when `autoFocus` was set. Just calls `focus(node)`. |
| `handleClickFocus(node)` | `:163` | Click hit on a node — focuses it iff `attributes.tabIndex` is a number. |
| `enable()` / `disable()` | `:169-175` | Suspend focus changes (used during certain modal flows). `focus()` and `moveFocus()` early-return when disabled. `blur()` is NOT gated. |
| `subscribeToFocus(node, listener)` | `:47` | Per-node subscription. Listener fires `(focused: boolean)`. Returns unsubscribe. Auto-cleans empty Sets. |
| `subscribe(listener)` | `:67` | Global subscription. Listener fires on any focus change. Returns unsubscribe. |

Module-level helpers: `getRootNode(node)` (`:239`), `getFocusManager(node)` (`:252`).

## Lifecycle

### focus(node)

```
focus(node):
  if node === activeElement OR not enabled: return
  if previous = activeElement:
    dedup previous in focusStack (splice if present)
    push previous
    truncate stack from front if length > MAX_FOCUS_STACK
    dispatchFocusEvent(previous, FocusEvent('blur', node))
  activeElement = node
  dispatchFocusEvent(node, FocusEvent('focus', previous))
  if previous: notifyNode(previous, false)
  notifyNode(node, true)
  notifyGlobal()
```

Notification order matches browser: focus event handler runs BEFORE hook subscribers see the change, so handlers observing `focusManager.activeElement` see the new element.

### handleNodeRemoved

`focus.ts:125`. Called by `reconciler.removeChild` / `removeChildFromContainer`.

1. Filter `focusStack`: drop the removed node and any node no longer in the tree (covers descendant unmounts that didn't get individual remove calls).
2. If `activeElement` is null, or in the tree but not the removed node — no-op.
3. Otherwise: blur active, drop its node listeners (the React component is gone; lingering listeners would prevent GC of the freed yoga subtree).
4. Pop the focus stack until a still-in-tree candidate is found, focus it. If stack exhausts, fire `notifyGlobal` so subscribers see "no focus."

### moveFocus(direction, root)

`focus.ts:185`. Walks the tree via `collectTabbable(root)` (`:207`) which DFS-collects every node where `attributes.tabIndex >= 0`. Wraps cyclically. `tabIndex === -1` is programmatic-focus-only — focusable via `focus()` but not via tab cycling.

## Listener notification

Both `nodeListeners` and `globalListeners` iterate via `[...set]` snapshot copy (`focus.ts:80, 84`). A listener that unsubscribes during dispatch doesn't perturb the iteration. Modern JS Set iterators tolerate concurrent deletion, but the explicit copy is unambiguous and cheap (subscriber count is bounded by focusable element count).

`notifyNode(node, focused)` looks up the per-node Set; if the node has no listeners (the common case for non-focused nodes), early-returns.

## tabIndex semantics

| Value | Tab-cycle | Programmatic `focus()` | Click-focus via `handleClickFocus` |
|---|---|---|---|
| `>= 0` | Yes (in document order) | Yes | Yes |
| `-1` | No | Yes | Yes (any number triggers focus) |
| undefined | No | Yes (any node can be focused) | No (only typed numbers focus) |

`collectTabbable` requires `typeof tabIndex === 'number' && tabIndex >= 0` (`focus.ts:215`). `handleClickFocus` requires `typeof tabIndex === 'number'` only (`:165`) — `-1` IS click-focusable.

## Invariants

- `FocusManager` is owned by the root `DOMElement` only. `getRootNode` throws if called on a node not in a tree with a `focusManager`.
- `focusStack` MUST dedup before pushing. Tab cycling without dedup would grow the stack unboundedly; the `MAX_FOCUS_STACK` truncation would then start dropping legitimate restoration targets.
- Listener iteration MUST snapshot. Listeners that unsubscribe-during-dispatch are common (a `useEffect` cleanup running because focus moved away from its component).
- `handleNodeRemoved` MUST drop `nodeListeners.get(removed)`. The owning React component is gone; a stale listener still referencing the freed yoga subtree blocks GC of the entire subtree.
- Notification order: focus events first, then per-node listeners, then global. Handlers that read `activeElement` see the new state.

## Common pitfalls

- Storing `activeElement` in React state. Forces re-render of every consumer on every focus change, defeats the per-node listener split.
- Calling `focus(node)` from inside a per-node listener for a different node. The listener fires during `focus()`'s notification phase; reentering `focus()` mid-notification works but reorders the stack confusingly. Defer with `queueMicrotask` if you need it.
- Forgetting to set `tabIndex` on a node you want tab-cycle reachable. `useFocus` handles this; manual `focus()` calls don't require it but tab cycling silently skips the node.
- Calling `getFocusManager(node)` on a node before it's been appended to the tree. Throws — check `node.parentNode` chain first or use `commitMount` timing.
- Reading `focusStack` from outside `focus.ts`. Private. Iterate `nodeListeners` keys or subscribe globally if you need to observe focusable set membership.

## Source

- Primary: `packages/renderer/src/focus.ts`
- Tests: `packages/renderer/src/focus.test.ts` (subscribeToFocus, global subscribe)
- Hooks: `packages/renderer/src/hooks/use-focus.ts`, `packages/renderer/src/hooks/use-focus-manager.ts`
- Reconciler integration: `packages/renderer/src/reconciler.ts:356` (`commitMount` → `handleAutoFocus`), `:378, :418` (removal → `handleNodeRemoved`)
- Click integration: `packages/renderer/src/events/dispatcher.ts` (calls `handleClickFocus` on hit)
- Focus event type: `packages/renderer/src/events/focus-event.ts`
