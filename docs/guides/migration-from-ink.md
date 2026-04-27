# Migration from Ink

How to port an [Ink](https://github.com/vadimdemedes/ink) app to `@yokai/renderer`.

## What stays the same

Most JSX, components, and hooks transfer unchanged.

| Area | Identical to Ink |
|------|------------------|
| `<Box>`, `<Text>`, `<Spacer>`, `<Newline>`, `<Link>` | Same prop shapes |
| `render()`, `renderSync()` | Same signature, returns `Instance` |
| `useInput`, `useApp`, `useStdin` | Same return shape |
| `measureElement`, `Static` patterns | Same |
| `tabIndex={0}` opt-in for focusables | Same |
| Flexbox styling vocabulary | Same property names and string values |

## What is different

### `useFocus` returns a ref + imperative `focus()`

```tsx
// Ink
const { isFocused } = useFocus()
return <Box>{isFocused && '>'}</Box>

// yokai
const { ref, isFocused, focus } = useFocus()
return <Box ref={ref} tabIndex={0}>{isFocused && '>'}</Box>
```

Yokai requires you to attach the `ref` and pass `tabIndex={0}` yourself. The hook does not inject either — that opt-in mirrors web a11y semantics. See `packages/renderer/src/hooks/use-focus.ts`.

### `useFocusManager` shape

Yokai exposes a reactive `focused` element plus imperative `focus`, `focusNext`, `focusPrevious`, `blur`. Ink's manager exposes only `enableFocus`, `disableFocus`, `focus(id)`, `focusNext`, `focusPrevious`. There is no string-id system in yokai — focus is keyed on the DOM element itself.

```tsx
const { focused, focus, focusNext, focusPrevious, blur } = useFocusManager()
```

See `packages/renderer/src/hooks/use-focus-manager.ts`.

### New components

| Component | Purpose |
|-----------|---------|
| `<ScrollBox>` | Imperative scrollable region with viewport culling |
| `<AlternateScreen>` | Enter/exit alt-screen + mouse tracking |
| `<Draggable>` | Cell-grid drag with bounds + lifecycle callbacks |
| `<DropTarget>` | Drag-acceptor region with enter/over/leave/drop |
| `<Resizable>` | Box with grabbable handles (s/e/se) |
| `<FocusGroup>` | Arrow-key navigation between focusables |
| `<FocusRing>` | Focusable Box with built-in focus border |
| `<RawAnsi>` | Inject pre-rendered ANSI byte-streams |
| `<NoSelect>` | Exclude a region from text selection |

### Mouse events on `<Box>`

`onClick`, `onMouseDown`, `onMouseEnter`, `onMouseLeave` are supported on every `<Box>`, but only fire inside `<AlternateScreen>` (mode-1003 mouse tracking is gated on alt-screen).

### Gesture capture

`<Box>`'s `onMouseDown` receives a `MouseDownEvent` with `event.captureGesture({ onMove, onUp })`. Calling it claims subsequent mouse-motion events and the eventual release for one drag — selection extension is suppressed for the duration. There is no equivalent in Ink. See `packages/renderer/src/events/mouse-event.ts`.

### `zIndex` on absolute-positioned nodes

Yokai honors `Styles.zIndex` on `position: 'absolute'` nodes. Stacking is per-parent (a nested z-indexed absolute sorts among its siblings inside its parent, not against distant cousins). Ink ignores `zIndex` entirely. On in-flow nodes yokai also ignores it (with a dev warning).

### Pure-TS Yoga

Layout runs through `@yokai/shared`'s pure-TypeScript flexbox engine — no WASM, no native binding. One default differs from Ink:

| Property | Ink default | yokai default |
|----------|-------------|---------------|
| `flexShrink` | 1 (CSS) | 0 |

Existing Ink layouts that relied on automatic shrinking need `flexShrink={1}` set explicitly.

## Removed / renamed APIs

The following Ink APIs are not exported by `@yokai/renderer` (verified against `packages/renderer/src/index.ts`):

| Ink API | Status in yokai |
|---------|-----------------|
| `<Static>` | Not exported as a component |
| `<Transform>` | Not exported |
| `useFocus({ id })` | No id parameter; identity is the DOM ref |
| `useFocusManager().enableFocus`/`disableFocus` | Not present |
| `useFocusManager().focus(id)` | Replaced by `focus(domElement)` |

Yokai adds: `useTerminalFocus`, `useTerminalViewport`, `useInterval`, `useAnimationTimer`, `useAnimationFrame`, `useTerminalTitle`, `useTabStatus`, `useDeclaredCursor`, `useSearchHighlight`, `useSelection`, `useHasSelection`, `TerminalSizeContext`, `useTheme`.

## Before / after

```tsx
// Ink
import { render, Box, Text, useFocus } from 'ink'

function Item({ label }: { label: string }) {
  const { isFocused } = useFocus()
  return (
    <Box>
      <Text color={isFocused ? 'cyan' : undefined}>{label}</Text>
    </Box>
  )
}

render(<Item label="Hello" />)
```

```tsx
// yokai
import { render, Box, Text, useFocus, AlternateScreen } from '@yokai/renderer'

function Item({ label }: { label: string }) {
  const { ref, isFocused } = useFocus()
  return (
    <Box ref={ref} tabIndex={0} flexShrink={1}>
      <Text color={isFocused ? 'cyan' : undefined}>{label}</Text>
    </Box>
  )
}

render(
  <AlternateScreen>
    <Item label="Hello" />
  </AlternateScreen>,
)
```
