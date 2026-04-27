# Reconciler

React 19 host config that translates fiber commits into virtual-DOM mutations and schedules frames.

## Responsibility

Owns the `react-reconciler` host config: instance creation, child mounts, prop diffing on update, removal + cleanup, focus-on-mount, and update-priority bridging into the event dispatcher. Does NOT own layout, painting, or terminal I/O — those are downstream of `resetAfterCommit`'s call to `rootNode.onComputeLayout()` and `onRender()`.

## Key types

| Symbol | Source | Purpose |
|---|---|---|
| `reconciler` | `reconciler.ts:198` | The configured `react-reconciler` instance. Default export. |
| `dispatcher` | `reconciler.ts:161` | The renderer-wide `Dispatcher`. Owned here so `setCurrentUpdatePriority` / `resolveUpdatePriority` can read/write it without import cycles. |
| `applyProp(node, key, value)` | `reconciler.ts:95` | Routes a prop to `setStyle`, `textStyles` field, `setEventHandler`, or `setAttribute` based on key. |
| `cleanupYogaNode(node)` | `reconciler.ts:69` | `unsetMeasureFunc` → `clearYogaNodeReferences` (recursive null) → `freeRecursive`. The reference-clearing pass is critical (see invariants). |
| `getOwnerChain(fiber)` | `reconciler.ts:132` | Walks `_debugOwner ?? return` up to 50 frames; populated onto `node.debugOwnerChain` when `CLAUDE_CODE_DEBUG_REPAINTS` is set. |
| `HostContext` | `reconciler.ts:84` | `{ isInsideText: boolean }` — promotes `ink-text` to `ink-virtual-text` when nested. |

## Lifecycle / pipeline

Per commit:

1. `prepareForCommit` — records `_prepareAt` for instrumentation; returns `null`.
2. React calls `createInstance` / `createTextInstance` / `appendInitialChild` / `appendChild` / `insertBefore` / `commitUpdate` / `commitTextUpdate` / `removeChild` / `removeChildFromContainer` as it walks the work-in-progress tree.
   - `createInstance` (`reconciler.ts:298`): asserts no `<Box>` inside `<Text>`, promotes `ink-text` → `ink-virtual-text` inside text context, calls `createNode`, then iterates props through `applyProp`. Records owner chain when debug-repaints enabled.
   - `createTextInstance` (`reconciler.ts:325`): asserts inside text context, calls `createTextNode`.
   - `commitUpdate` (`reconciler.ts:381`): React 19 receives `(node, type, oldProps, newProps)` directly — no updatePayload. Diffs both `props` and `style` shallowly via local `diff()` helper. Style → `setStyle` (DOM mutation) and `applyStyles(yogaNode, …)` (yoga mutation) when style diff is non-empty. `textStyles` → `setTextStyles`. Event handlers → `setEventHandler` (does not mark dirty — handler identity changes shouldn't defeat the blit fast path; see `dom.ts:48-52`). Other keys → `setAttribute`.
   - `removeChild` / `removeChildFromContainer` (`reconciler.ts:413`, `:375`): `removeChildNode` → `cleanupYogaNode` → `focusManager.handleNodeRemoved`.
3. `finalizeInitialChildren` returns `props.autoFocus === true` to request a `commitMount` callback (`reconciler.ts:353`).
4. `commitMount` (`reconciler.ts:356`): calls `getFocusManager(node).handleAutoFocus(node)`. Fires once per node when first mounted with `autoFocus`.
5. `resetAfterCommit` (`reconciler.ts:221`):
   - Calls `rootNode.onComputeLayout()` — yoga `calculateLayout` from `ink.tsx`.
   - In `NODE_ENV === 'test'`, calls `rootNode.onImmediateRender()` and returns.
   - Otherwise calls `rootNode.onRender()` — the throttled `scheduleRender` from `ink.tsx`.
   - Records phase timings into `_lastCommitMs` / `_lastYogaMs`.

`hideInstance` / `unhideInstance` (`reconciler.ts:340-349`) toggle `node.isHidden` and the yoga node's `Display` between `None` and `Flex`, then `markDirty(node)`. Used by React's offscreen / Suspense.

## Update-priority bridge

The reconciler's discrete-event channel is wired to the dispatcher at module scope:

```
dispatcher.discreteUpdates = reconciler.discreteUpdates.bind(reconciler)  // reconciler.ts:460
```

`getCurrentUpdatePriority` / `setCurrentUpdatePriority` / `resolveUpdatePriority` proxy to `dispatcher.currentUpdatePriority` and `dispatcher.resolveEventPriority()`. `resolveEventType` / `resolveEventTimeStamp` read `dispatcher.currentEvent`. This breaks an otherwise-circular import (`dispatcher.ts` doesn't import `reconciler.ts`).

## Invariants

- `cleanupYogaNode` MUST clear all subtree `yogaNode` references BEFORE calling `freeRecursive()`. If freed memory is read later (concurrent measure), the WASM-style accessor can crash. The pure-TS port doesn't crash on reads of freed objects, but the invariant is preserved for parity and to help GC.
- Removal path runs `removeChildNode` → `cleanupYogaNode` → focus restoration in that order. Reordering leaves a freed yoga node referenced from the focus manager's restoration path.
- `_eventHandlers` is stored separately from `attributes` (`dom.ts:50-52`) so handler-identity churn (a new arrow function each render) does not call `markDirty`. Defeating this would defeat the blit fast path on every event-handler-bearing node.
- `commitUpdate`'s style diff calls `applyStyles(yogaNode, style, newProps.style)` only when the diff is non-empty AND `node.yogaNode` exists. Some node types (`ink-virtual-text`, `ink-link`, `ink-progress`) have no yoga node — see `dom.ts:112-113`.

## Common pitfalls

- Adding a new prop that should NOT trigger re-layout: route it through `_eventHandlers` or a dedicated field, not `setAttribute` — `setAttribute` calls `markDirty` (`dom.ts:242`).
- Reading `node.yogaNode.getComputedX()` immediately after `commitUpdate` — yoga is not recomputed until `resetAfterCommit` calls `onComputeLayout`. Reads inside the commit phase return stale values.
- Removing a node with focused descendants: `handleNodeRemoved` walks the focus stack to restore. If you bypass `removeChildFromContainer` / `removeChild`, focus is left dangling on a freed subtree.

## Source

- Primary: `packages/renderer/src/reconciler.ts`
- DOM mutation: `packages/renderer/src/dom.ts` (`createNode`, `appendChildNode`, `insertBeforeNode`, `removeChildNode`, `setAttribute`, `setStyle`, `setTextStyles`, `markDirty`, `clearYogaNodeReferences`)
- Style apply: `packages/renderer/src/styles.ts`
- Event-handler key set: `packages/renderer/src/events/event-handlers.ts`
- Focus integration: `packages/renderer/src/focus.ts` (`getFocusManager`, `getRootNode`, `handleAutoFocus`, `handleNodeRemoved`)
