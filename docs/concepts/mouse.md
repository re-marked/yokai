# Mouse

Yokai parses SGR mouse reports from the terminal and dispatches click, press, hover, and gesture events through the DOM tree.

## When mouse events fire

Mouse tracking is enabled only inside `<AlternateScreen mouseTracking>` (default `true`). Outside the alt-screen, no mouse events fire. `Ink.dispatchMouseDown`, `dispatchClick`, and `dispatchHover` all gate on `altScreenActive`.

`<AlternateScreen>` writes `ENABLE_MOUSE_TRACKING` on mount and `DISABLE_MOUSE_TRACKING` on unmount. Both sequences also fire unconditionally on signal exit so a crashed app cannot leave the terminal in tracking mode.

## SGR encoding (mode 1006)

The terminal reports mouse activity as `CSI < button ; col ; row M` for press / motion and `CSI < button ; col ; row m` for release. `parse-keypress.ts` matches this with `SGR_MOUSE_RE` and yields `{ kind: 'mouse', button, col, row, release }`.

The button byte:
- Low 2 bits: `0` = left, `1` = middle, `2` = right.
- `0x04` = shift, `0x08` = alt, `0x10` = ctrl.
- `0x20` = motion (drag with button held). Masked off the public `button` field — it's a transport detail.
- `0x40+` = wheel and extended buttons.

Coordinates arrive 1-indexed; `App.handleMouseEvent` converts to 0-indexed cells.

## Event types

```ts
onClick?: (event: ClickEvent) => void
onMouseDown?: (event: MouseDownEvent) => void
onMouseEnter?: () => void
onMouseLeave?: () => void
```

`onClick` fires on left release without drag. `onMouseDown` fires on any press. Both bubble through `parentNode`. `cellIsBlank` on `ClickEvent` is true if the clicked cell has no written content — handlers can use this to ignore clicks on empty space.

`onMouseEnter` / `onMouseLeave` fire as the cursor crosses node boundaries. They do not bubble: moving between two children of the same parent does not re-fire on the parent. `dispatchHover` diffs the current hovered set against the previous one.

## Local coordinates

Each `ClickEvent` and `MouseDownEvent` carries `localCol` / `localRow`, the press position relative to the current handler's rect. The dispatcher recomputes these per node before each handler fires, so a container handler sees coordinates relative to itself, not to the deepest hit child.

## Gesture capture

```tsx
<Box onMouseDown={(e) => {
  e.captureGesture({
    onMove: (move) => { /* one per cell crossed */ },
    onUp: (up) => { /* exactly once at release */ },
  })
}} />
```

Capture lasts from press to the next release. While captured:

- Selection extension is suppressed — no highlight trail.
- All motion events route to `onMove` even when the cursor leaves the originally-pressed element's bounds.
- The release fires `onUp` and clears the capture; the normal release path (onClick, selection finish) is skipped.

The active gesture lives on `App.activeGesture`. It is drained on `FOCUS_OUT` and on lost-release recovery so a drag aborted by leaving the terminal window cannot leave a dangling handler.

`MouseMoveEvent` and `MouseUpEvent` do NOT bubble — they go directly to the captured handler.

## See also
- [Events](../concepts/events.md)
- [Box](../components/box.md)
- [AlternateScreen](../components/alternate-screen.md)
