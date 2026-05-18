# Window

yokai's top-level desktop primitive — a floating rectangle with a titlebar, drag-from-titlebar movement, edge/corner resize handles, raise-on-press z math, focused/blurred chrome, optional modal mode with backdrop, and **focus-/hover-scoped event routing** for everything inside.

A `<Window>` composes `<Surface>` (paint substrate), `handleDragPress` (the same pure helper `<Draggable>` uses), `handleResizePress` (from `<Resizable>`), `WindowManager` (focus stack), and `WindowFocusContext` + `CursorOverWindowContext` providers. All of that lives behind one component with **one rect state** and one lifecycle — fixing the A4 root cause where nesting Draggable inside Resizable made the yoga absolute-rect cache go out of sync (PR #56).

> **Replaces the interim `docs/patterns/window.md`** Draggable-as-window pattern. The interim approach is still valid for fixed-size windows, but `<Window>` is the recommended primitive going forward.

## Import

```tsx
import { Window } from '@yokai-tui/renderer'
import type {
  WindowProps,
  WindowRect,
  WindowFocusInfo,
  WindowId,
  WindowFocusValue,
  CursorOverWindowValue,
} from '@yokai-tui/renderer'

// Contexts — consumers rarely import these directly; useInput's auto-
// routing reads them under the hood. Exposed for advanced consumers
// that want to render focus-aware chrome inside a window.
import { WindowFocusContext, CursorOverWindowContext } from '@yokai-tui/renderer'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| **Initial geometry** | | | |
| `initialPos` | `{ top: number; left: number }` | **required** | Initial top-left in cells, relative to parent's content edge. Seeded at mount only (`defaultValue` semantics) — drag updates the window's own state thereafter. |
| `initialSize` | `{ width: number; height: number }` | **required** | Initial size in cells. Same `defaultValue` semantics — resize updates the window's own state. Width AND height are required; auto-sizing isn't supported (that's exactly what made the interim composition fail). |
| **Chrome** | | | |
| `title` | `string` | `''` | Title in the titlebar. Empty means no label; titlebar still renders (it's the drag affordance). |
| `showCloseButton` | `boolean` | `false` | Renders a `×` close button at the titlebar's right edge. Uses `captureGesture({ onUp })` so a press-and-release fires `onClose` even if the cursor twitches between press and release. |
| `onClose` | `() => void` | — | Fires when the close button is released over itself. Not fired by Esc or focus loss — close is an explicit action; wire your own Esc handler if you want it. |
| **Drag / resize behavior** | | | |
| `draggable` | `boolean` | `true` | When `false`, titlebar isn't a drag affordance — window stays at `initialPos`. Useful for pinned panels. |
| `resizable` | `boolean` | `true` | When `false`, no resize handles render. Useful for fixed-size dialogs. |
| `handles` | `('s' \| 'e' \| 'se')[]` | `['s', 'e', 'se']` | Which resize handles to render. v1 supports the bottom-right family only (north/west/NW/SW/NE shift the layout origin in ways that fight flexbox). |
| `bounds` | `{ width: number; height: number }` | — | Clamp in parent content space. Drag AND resize both respect this — a resize that would push the right edge past `bounds.width` clamps at the boundary. |
| `minSize` | `{ width: number; height: number }` | `{ width: 8, height: 4 }` | Minimum resize size. The default is wide enough for a 4-char title + close button, tall enough for the titlebar + a single content row. |
| `maxSize` | `{ width: number; height: number }` | — | Maximum resize size. Combined with `bounds`, the tighter of the two wins. |
| **Focus / routing** | | | |
| `modal` | `boolean` | `false` | Modal window — claims focus on mount, renders a backdrop scrim, paints in Surface's `modal` z-band (≥3000) so peers can't paint over. Nested modals stack — innermost wins. Mount-time only; toggling post-mount has no effect. |
| `claimsFocus` | `boolean` | `true` | When `true`, mounting claims focus AND every press promotes the window. When `false`, the window never auto-claims — useful for "panel" windows that should never steal focus from the user's text-editing window. Modals always claim regardless. |
| `onWindowFocus` | `(info: WindowFocusInfo) => void` | — | Fires on the FLIP from blurred → focused, including initial mount-as-focused. Does NOT re-fire on every render. |
| `onWindowBlur` | `(info: WindowFocusInfo) => void` | — | Fires on the FLIP from focused → blurred. Does NOT fire on initial mount-as-blurred, and does NOT fire on unmount-while-focused (use your own unmount lifecycle for that). |
| **Visual** | | | |
| `borderStyle` | per `Styles['borderStyle']` | `'single'` | Border style when focused or blurred. Same vocabulary as Surface / Box. |
| `borderColor` | `Color` | `'cyan'` | Border color when focused — deliberately distinct from blurred so a multi-window WM is legible at a glance. |
| `blurredBorderColor` | `Color` | `'gray'` | Border color when not focused. |
| `backgroundColor` | `Color` | — | Window body fill. Default `undefined` (transparent — terminal background shows through). Set `'black'` or your theme bg for opaque windows that don't leak content from windows behind them. |
| `titlebarColor` | `Color` | — | Titlebar row background (defaults to `backgroundColor`). Set to a tint for macOS-style "title strip". |
| `backdropColor` | `Color` | `'black'` | Backdrop scrim color when `modal=true`. Solid fill (terminals don't do alpha). |
| **Event handlers (pass through to underlying Surface)** | | | |
| `ref` / `tabIndex` / `autoFocus` / `claimFocusOnClick` | per `Box` / `Surface` | — | Focus passthrough. `claimFocusOnClick` controls ELEMENT focus (`FocusManager`); orthogonal to `claimsFocus` (which controls WINDOW focus). |
| `onClick` / `onMouseDown` / `onMouseEnter` / `onMouseLeave` / `onKeyDown` / `onFocus` / `onBlur` | per `Box` | — | Event handler passthrough. Window's own raise-on-press and cursor-over tracking run BEFORE the consumer's handler, so the consumer sees up-to-date focus/hover state on inspection. |
| `children` | `ReactNode` | — | Window body content. |

## Auto-routed event scopes

The headline of A18 is "anything inside a `<Window>` automatically gets focus-/hover-scoped event routing." `useInput` reads two contexts the Window provides:

| Event class | Routing rule | Why |
|---|---|---|
| Keyboard (arrows, letters, ctrl-shortcuts, paste) | **focus-scoped** — fires when the enclosing Window is focused | Matches the "keyboard follows focus" mental model. |
| Wheel (`key.wheelUp` / `key.wheelDown`) | **hover-scoped** — fires when the cursor is over the enclosing Window | Matches real-OS scroll: scroll whatever you're hovering, not what has focus. |
| Click / mouseDown | **hit-test-scoped** (unchanged) | Existing dispatch already lands clicks on the topmost element under the cursor. |

Consumers inside a Window can drop the boilerplate:

```tsx
// Before — every consumer re-derives "is this my window?"
useInput((_, key) => {
  if (myWindowId !== activeWindowId) return  // ← unnecessary
  if (key.wheelDown) scroll(3)
})

// After — auto-routed
useInput((_, key) => {
  if (key.wheelDown) scroll(3)  // fires only when cursor is over this window
})
```

`isActive: true` and `isActive: false` still work as explicit overrides for consumers that want to opt out of the auto-routing.

## Modal mode

A modal Window:
- claims focus on mount,
- renders a backdrop scrim filling the parent (color via `backdropColor`),
- paints in Surface's `modal` z-band (≥3000) so peer windows can't paint over it,
- absorbs clicks at every cell the modal or backdrop covers via `hitTestBoundary`,
- blocks keyboard input to peer Windows automatically (their `useInput` is gated by `WindowFocusContext.isFocused`, which is `false` for peers when a modal is up).

Nested modals stack — innermost wins focus via the modal-barrier rule in `WindowManager`. Pressing a non-modal peer beneath the modal bumps its focus z (so it's "next in line" once the modal closes) but does NOT bring it visually above the modal.

`modal` is **mount-time only** — changing it post-mount is a no-op. To toggle modality, unmount and remount the Window.

## Examples

### Multi-window WM

```tsx
import { Box, Window, useInput } from '@yokai-tui/renderer'
import { useState } from 'react'

function Counter({ title, left }: { title: string; left: number }) {
  const [count, setCount] = useState(0)
  // Arrows fire only when this window is focused; wheel fires only
  // when the cursor is over this window. No isActive boilerplate.
  useInput((_, key) => {
    if (key.upArrow || key.wheelUp) setCount((c) => c + 1)
    if (key.downArrow || key.wheelDown) setCount((c) => c - 1)
  })
  return (
    <Window title={title} initialPos={{ top: 2, left }} initialSize={{ width: 24, height: 8 }}>
      <Box paddingX={1}>
        <Text>count: {count}</Text>
      </Box>
    </Window>
  )
}

<>
  <Counter title="alpha" left={2} />
  <Counter title="beta" left={28} />
  <Counter title="gamma" left={54} />
</>
```

### Modal confirm dialog

```tsx
function ConfirmModal({ onClose }: { onClose: (answer: boolean) => void }) {
  useInput((input) => {
    if (input === 'y') onClose(true)
    if (input === 'n') onClose(false)
  })
  return (
    <Window
      title="confirm"
      modal
      initialPos={{ top: 8, left: 22 }}
      initialSize={{ width: 36, height: 7 }}
      borderColor="yellow"
      resizable={false}
      draggable={false}
    >
      <Box paddingX={2} paddingY={1}>
        <Text>Close all panels? (y/n)</Text>
      </Box>
    </Window>
  )
}
```

### Closable window with focus callbacks

```tsx
<Window
  title="editor"
  showCloseButton
  onClose={() => setOpen(false)}
  initialPos={{ top: 2, left: 4 }}
  initialSize={{ width: 50, height: 16 }}
  onWindowFocus={({ windowId }) => persistLastFocused(windowId)}
>
  <TextInput value={text} onChange={setText} multiline autoFocus />
</Window>
```

### Panel window (doesn't steal focus)

```tsx
<Window
  title="mini-map"
  claimsFocus={false}
  initialPos={{ top: 0, left: 60 }}
  initialSize={{ width: 20, height: 10 }}
  resizable={false}
>
  <MapView />
</Window>
```

The mini-map renders and is visible, but clicking it doesn't steal keyboard focus from whatever Window the user was typing in. **Known limitation:** panel windows still take a `persistedZ` slot at mount-time, so a subsequently-mounted Window will paint above them. A future `layer` prop will let panels live in their own z-band; for now, mount panels last if you need them on top.

## Composition with other primitives

- **`<Surface>`** is the paint substrate; Window passes through `borderStyle`, `backgroundColor`, etc. directly.
- **`<Draggable>` and `<Resizable>`** reuse the same pure helpers Window does (`handleDragPress`, `handleResizePress`), so drag and resize math is byte-identical across primitives.
- **`<TextInput>`** works correctly inside a Window: the titlebar is the ONLY drag affordance, so pressing into the content area lets TextInput claim the press for caret positioning. (Differs from the interim Draggable-as-window pattern, where the whole frame was draggable and TextInput presses got swallowed.)
- **`<DropTarget>`** works inside a Window normally — Window doesn't intercept drop dispatch.

## See also

- [`Surface`](./surface.md) — the paint substrate Window composes on.
- [`Draggable`](./draggable.md) — the same drag math, without the chrome / focus stack / modal.
- [`Resizable`](./resizable.md) — the same resize math, without composition.
- [`useInput`](../hooks/use-input.md) — describes the auto-routing inside Windows (A18).
- [Interim `<Draggable>` window pattern](../patterns/window.md) — superseded by `<Window>` for new code; still valid for fixed-size cases.
- `examples/window/window.tsx` — live working example (`pnpm demo:window`).
- Issue [#56](https://github.com/re-marked/yokai/issues/56) — A4 design rationale.
- Issue [#75](https://github.com/re-marked/yokai/issues/75) — A18 design rationale.
