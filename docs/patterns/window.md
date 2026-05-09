# Window

A draggable, fixed-size floating panel with a titlebar, optional close button, and arbitrary content. Reach for this when building desktop-style UIs: floating editors, side panels, palettes, tool windows.

> **Interim pattern.** A first-class `<Window>` primitive is on the roadmap (issue #56). Until it ships, this is the canonical way to build a window-shaped element on yokai. The shape below is what `examples/scratchpad/scratchpad.tsx` runs in production.

## Code

```tsx
import {
  AlternateScreen,
  Box,
  Draggable,
  type MouseDownEvent,
  TerminalSizeContext,
  Text,
  TextInput,
  render,
  useApp,
  useInput,
} from '@yokai-tui/renderer'
import type React from 'react'
import { useCallback, useContext, useState } from 'react'

const WINDOW_WIDTH = 56
const WINDOW_HEIGHT = 14

/** Close button — captures the press so the click doesn't bubble to the
 *  underlying Draggable's mouseDown (which would race a phantom drag-start).
 *  Hover-red mirrors the macOS / Windows traffic-light close. */
function CloseButton({ onClose }: { onClose: () => void }): React.ReactNode {
  const [hover, setHover] = useState(false)
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      e.stopImmediatePropagation()
      e.captureGesture({ onUp: () => onClose() })
    },
    [onClose],
  )
  return (
    <Box
      paddingX={1}
      backgroundColor={hover ? 'red' : undefined}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onMouseDown={handleMouseDown}
    >
      <Text bold={hover} color={hover ? 'white' : 'gray'}>
        ×
      </Text>
    </Box>
  )
}

function App(): React.ReactNode {
  const { exit } = useApp()
  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) exit()
  })

  const [text, setText] = useState('hello window')
  const [open, setOpen] = useState(true)

  // Center on first paint. initialPos is captured at Draggable mount and
  // not re-applied on prop changes (matches React's defaultValue
  // semantics), so this centers ONCE — the user can drag freely from there.
  const size = useContext(TerminalSizeContext)
  const initialLeft = size?.columns ? Math.max(0, Math.floor((size.columns - WINDOW_WIDTH) / 2)) : 8

  return (
    <AlternateScreen mouseTracking>
      <Box flexDirection="column" width="100%" height="100%">
        {open && (
          <Draggable
            initialPos={{ left: initialLeft, top: 2 }}
            width={WINDOW_WIDTH}
            height={WINDOW_HEIGHT}
            borderStyle="single"
            borderColor="gray"
            backgroundColor="black"
            flexDirection="column"
          >
            {/* Titlebar — drag handle (drag bubbles to the Draggable
                naturally) + close button. */}
            <Box flexDirection="row" justifyContent="space-between" paddingX={1}>
              <Text dim>my window</Text>
              <CloseButton onClose={() => setOpen(false)} />
            </Box>
            {/* Content area — fills remaining vertical space. */}
            <Box flexDirection="column" flexGrow={1} paddingX={1} paddingTop={1}>
              <TextInput value={text} onChange={setText} multiline autoFocus />
            </Box>
          </Draggable>
        )}
      </Box>
    </AlternateScreen>
  )
}

render(<App />)
```

## How it works

1. **`<Draggable>` IS the window frame**. With `width` + `height` + `borderStyle` + `backgroundColor` + `flexDirection="column"`, a Draggable is exactly the rectangle a window needs. Press-anywhere-on-it to drag (titlebar OR content area), bordered chrome, opaque background, internal vertical layout.
2. **Children render inside the frame**. The titlebar is the first child, the content is the rest. Border + padding clip naturally.
3. **Close button uses gesture capture, not `onClick`**. The Draggable claims the mouseDown gesture for "potential drag-start" — but only if motion follows. A press-and-release on the close button without motion is a click semantically, but Draggable's old eager-capture meant in-window children couldn't `onClick` reliably.
   - **`e.stopImmediatePropagation()`** halts the bubble so Draggable's own `onMouseDown` doesn't see the press.
   - **`e.captureGesture({ onUp: ... })`** claims the gesture at the leaf. Per [`captureGesture` first-call-wins semantics](../components/draggable.md#props), the leaf wins; ancestors (Draggable) don't get to overwrite.
   - The `onUp` handler runs on release, which is the click.
4. **`paddingX={1}` titlebar gives drag-affordance**. The whole titlebar row is grabbable; only the close button captures the gesture for itself.
5. **Centered on first paint via `TerminalSizeContext`**. `initialPos` is mount-only (like `defaultValue`); compute the centered `left` once and the user can drag from there. Don't try to re-center on resize — it'll fight the user's drag.
6. **Open/close lifecycle**. Conditional render of the `<Draggable>` based on `open` state. Close button flips `open=false`; the window unmounts; reopening means a fresh mount with `initialPos` recomputed.

## Variations

- **No close button**: drop `<CloseButton>`. Window stays open until the host app's lifecycle decides otherwise.
- **Different titlebar content**: replace the `<Text dim>` with breadcrumbs, tab bar, status indicators, etc. As long as one element captures the close-or-equivalent action via `onMouseDown` + `e.captureGesture`, the rest can stay clickable.
- **Multiple windows**: render N `<Draggable>` siblings. Each owns its own z-index (Draggable bumps `persistedZ` on press for raise-on-press). The most-recently-pressed window stays in front of the others.
- **Constrained drag**: pass `bounds={{ width, height }}` so the window can't be dragged past viewport edges. Useful when the WM should keep windows reachable.
- **Modal mode**: combine with the [Modal](./modal.md) pattern's backdrop. Note that `<Draggable>` owns its own `zIndex` internally (it bumps `persistedZ` on press, starting around 10 and growing), so passing `zIndex` as a prop is ignored. To put a Draggable above a backdrop, give the BACKDROP a low absolute `zIndex` (e.g. `zIndex={1}`) and let the Draggable's natural press-bumped z float above it. Pressing the window once bumps it well above any low backdrop value:
  ```tsx
  {/* Backdrop sits at z=1; press-bumped Draggable lives at z >= 10 */}
  <Box position="absolute" top={0} left={0} width="100%" height="100%" backgroundColor="black" zIndex={1} />
  <Draggable initialPos={...} width={W} height={H} borderStyle="single">
    {/* window content */}
  </Draggable>
  ```
  If you need a guaranteed-stacking ordering without relying on press-bump, track a related issue on yokai for an explicit `baseZIndex` prop on Draggable.
- **Resizable corners**: not supported in this interim pattern. For resize, you'd compose `<Resizable>` inside `<Draggable>`, but the two don't currently combine cleanly (drag math vs. resize math fight over the rect). Tracked as part of the `<Window>` primitive (issue #56).

## Known caveats

- **Interactive children inside the window need the gesture-capture pattern.** Buttons, sidebar items, breadcrumb segments — anything clickable inside a Draggable should mirror `<CloseButton>`'s `onMouseDown` + `e.stopImmediatePropagation()` + `e.captureGesture({onUp: ...})` shape. Wrap into a `<ClickableBox>` if you have many.
  - Sidenote: the eager-capture root cause is being addressed (issue #72 / A22). Once that's fixed, plain `onClick` on in-window children will work without the boilerplate.
- **`width` + `height` are required.** Auto-sizing via flex doesn't work cleanly for absolute-positioned Draggable; pin both dimensions.
- **The titlebar drag handle is implicit.** Press anywhere on the window frame to drag — there's no "title-bar-only drag" mode. If your content is a `<TextInput>` (like the scratchpad demo), the input claims the press for its own selection; users have to grab the titlebar (or any non-input area) to drag.

## Related

- [`Draggable`](../components/draggable.md) — the underlying primitive
- [Modal](./modal.md) — combine with backdrop for modal-window UX
- `examples/scratchpad/scratchpad.tsx` — live working example
- Issue [#56](https://github.com/re-marked/yokai/issues/56) — proper `<Window>` primitive (long-term)
- Issue [#72](https://github.com/re-marked/yokai/issues/72) — eager-capture fix that will let plain `onClick` work inside Draggable
