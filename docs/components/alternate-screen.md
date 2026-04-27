# AlternateScreen

Switches the terminal into the alternate screen buffer for the duration of the mount and optionally enables SGR mouse tracking.

## Import
```tsx
import { AlternateScreen } from '@yokai/renderer'
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mouseTracking` | `boolean` | `true` | Enable SGR mouse tracking (wheel, click, drag) |
| `children` | `ReactNode` | — | Content rendered inside the constrained-height viewport |

## Examples

### Basic
```tsx
<AlternateScreen>
  <Box flexDirection="column" height="100%">
    <Text>fullscreen UI</Text>
  </Box>
</AlternateScreen>
```

### Without mouse tracking
```tsx
<AlternateScreen mouseTracking={false}>
  <App />
</AlternateScreen>
```

## Behavior

- On mount: writes `DEC 1049` to enter the alt screen, clears it, homes the cursor, then optionally enables SGR mouse tracking.
- The component renders a `<Box>` constrained to the terminal row count (`height={size.rows}`, `width="100%"`, `flexShrink={0}`); overflow must be handled with `overflow: scroll` or flex layout — the alt screen has no native scrollback.
- On unmount: disables mouse tracking and exits the alt screen, restoring the previous main-screen content.
- Uses `useInsertionEffect` (not `useLayoutEffect`) so `ENTER_ALT_SCREEN` reaches the terminal before the first frame writes — avoids leaving a stray frame on the main screen that reappears at exit.
- Notifies the `Ink` instance via `setAltScreenActive()` so signal-exit cleanup can leave the alt screen even if React unmount does not run.
- Mouse events (click, drag, wheel) only fire on `<Box>` / `<Button>` inside this component.
- Safe for ctrl-O–style transcript overlays — the main screen content is preserved.

## Related
- [Box](box.md), [Button](button.md)
- [Mouse events](../concepts/mouse.md)

## Source
[`packages/renderer/src/components/AlternateScreen.tsx`](../../packages/renderer/src/components/AlternateScreen.tsx)
