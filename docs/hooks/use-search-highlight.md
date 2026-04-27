# useSearchHighlight

Highlight search matches in screen-space across the rendered frame.

## Import
```tsx
import { useSearchHighlight } from '@yokai/renderer'
```

## Signature
```tsx
function useSearchHighlight(): {
  setQuery: (query: string) => void
  scanElement: (el: DOMElement) => MatchPosition[]
  setPositions: (
    state: { positions: MatchPosition[]; rowOffset: number; currentIdx: number } | null,
  ) => void
}
```

## Returns
| Field | Type | Description |
|-------|------|-------------|
| `setQuery` | `(query: string) => void` | Set the highlight query. Non-empty inverts (SGR 7) every visible occurrence on the next frame; empty string clears. |
| `scanElement` | `(el: DOMElement) => MatchPosition[]` | Paint a DOM subtree from the main tree to a fresh Screen at its natural height and scan it. Returns element-relative positions (row 0 = element top). Reuses the live element with all real providers — zero context duplication. |
| `setPositions` | `(state \| null) => void` | Position-based **current** highlight. Each frame paints yellow at `positions[currentIdx]` offset by `rowOffset`. Overlays on top of the inverse scan-highlight. `null` clears. |

Highlights match the **rendered** text, not source text — anything visible (bash output, file paths, error messages) highlights regardless of origin. Truncated/ellipsized matches do not highlight.

Returned object is memoized on the singleton Ink instance; outside fullscreen all methods are no-ops.

## Examples
### Live query
```tsx
function Search({ query }: { query: string }) {
  const { setQuery } = useSearchHighlight()
  useEffect(() => {
    setQuery(query)
    return () => setQuery('')
  }, [query, setQuery])
  return null
}
```

### Current-match navigation
```tsx
const { scanElement, setPositions } = useSearchHighlight()

useLayoutEffect(() => {
  const positions = scanElement(messageRef.current!)
  setPositions({ positions, rowOffset: scrollTop, currentIdx })
  return () => setPositions(null)
}, [query, scrollTop, currentIdx])
```

## When to use
- Find-in-output, navigable match cycling, ephemeral query highlights.
- Pair `setQuery` (all matches, dim) with `setPositions` (current match, bright).

## Related
- `MatchPosition` from `render-to-screen`
- [`useSelection`](./use-selection.md) — same overlay machinery

## Source
[`packages/renderer/src/hooks/use-search-highlight.ts`](../../packages/renderer/src/hooks/use-search-highlight.ts)
