# State management

Most yokai state lives in React; two subsystems own state outside of React on purpose, and trying to mirror them in will fight the renderer.

## Default: React state

Component state, prop-driven layout, focus tracking, and most user interaction belong in React. The reconciler commits each render into the DOM, the renderer diffs the resulting frame, and stdout receives the patch. This is the path for everything unless a specific reason calls for direct mutation.

```tsx
function Counter() {
  const [n, setN] = useState(0)
  useInput((_, key) => key.return && setN(n + 1))
  return <Text>{n}</Text>
}
```

## Exception: ScrollBox `scrollTop`

`scrollTo`, `scrollBy`, `scrollToBottom`, and `scrollToElement` mutate `scrollTop` directly on the DOM node. They do not call `setState`. The renderer reads `scrollTop` from the node during its next tick.

This is required for race-free scroll under streaming content: a wheel event arriving while React is mid-commit on new content cannot be cleanly serialized through React state without dropping events or computing against stale layout. The microtask-coalesced direct-mutation path lands every event before the next paint.

If you mirror `scrollTop` into React state to render an indicator, subscribe via `ScrollBoxHandle.subscribe` rather than reading from React-owned state — the React copy will lag.

```tsx
useEffect(() => ref.current?.subscribe(() => {
  setIndicator(ref.current!.getScrollTop())
}), [])
```

## Exception: selection state

`SelectionState` is owned by `Ink`, not React. Mouse events mutate it directly via `startSelection` / `updateSelection` / `finishSelection`, and the highlight is applied as a per-cell style swap before the frame diff. This is what lets the highlight survive arbitrary React re-renders during a streaming response.

Read selection from React with `useHasSelection` (Ink notifies subscribers on change). Don't try to manage anchor/focus from React.

## When to break the rule

Don't, unless you've got a specific race or perf requirement that React state can't meet, and you've written tests for the streaming case. The two exceptions above earned their exemption with explicit hazards documented in `selection.ts` and `ScrollBox.tsx`. New direct-mutation paths need the same justification.

## See also
- [Scrolling](../concepts/scrolling.md)
- [Selection](../concepts/selection.md)
- [Performance](../concepts/performance.md)
