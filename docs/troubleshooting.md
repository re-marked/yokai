# Troubleshooting

Common runtime failures and fixes.

### Mouse events don't fire

Mouse tracking requires `<AlternateScreen mouseTracking>`. Without `mouseTracking` the renderer never enables `?1000h` and stdin sees no mouse sequences. The alt-screen prop alone is not sufficient.

### Tab cycling skips an element

`tabIndex` must be a non-negative number. `tabIndex="0"` (string) is ignored by the focus manager. Only `<Box>` accepts `tabIndex`; setting it on `<Text>` is a no-op.

### Arrow keys don't move focus

Tab cycling is global; arrow navigation is opt-in. Wrap the focusable region in `<FocusGroup direction="column" wrap>`. `useFocusManager()` alone does not bind arrow keys.

### Box overflows its parent

Yoga does not shrink children by default. Set `flexShrink={1}` on the child, or `overflow="hidden"` on the parent to clip. For text, also set `wrap="truncate"` or similar.

### Text is cut off mid-word

Set `wrap="wrap"` on the `<Text>`, or widen the parent container. Wrapping respects terminal width via `useTerminalViewport`. For fixed columns, set `width` on the enclosing Box.

### Colors don't show

Check the terminal's color capability. Set `FORCE_COLOR=1` to override detection in pipes and CI. `FORCE_COLOR=3` forces 24-bit. If colors render as raw ANSI escapes in output, the terminal is not interpreting them — check `TERM` is set.

### Layout flickers on resize

Debounce reactive reads from `useTerminalViewport`, or batch state changes in a single `setState` call. Resize fires SIGWINCH, which can pulse rapidly during a drag-resize of the terminal window itself.

### Drag handle doesn't respond after I add a wrapper around it

Gesture capture fires on the deepest hit. A wrapper with its own `onMouseDown` that calls `e.stopImmediatePropagation()` swallows the event before the inner handle sees it. Remove the outer handler or remove the propagation stop.

### ScrollBox jumps to top on every render

Set `stickyScroll` to keep the scroll pinned to the bottom on append. If a scrolled list resets to top on each parent re-render, the children's `key` props are unstable — React is recreating instances, and ScrollBox sees a new content tree. Use stable ids.

### App exits immediately

Something must keep the event loop alive. `render` does this when stdin is a TTY (raw mode + listener). If stdin is piped or redirected, raw mode is unavailable; use `useApp().exit` to control lifecycle, or read from a file instead. Check `useStdin().isRawModeSupported`.

### TypeScript can't find @yokai/renderer

Run `pnpm install` and `pnpm build` in order. Renderer's types are emitted by its build step and depend on shared being built first. In a workspace, ensure the consumer's `tsconfig.json` `paths` resolve to the built `dist/` or that workspace symlinks are present.
