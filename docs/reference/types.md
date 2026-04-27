# Types reference

Every type exported from `@yokai/renderer`. Source: `packages/renderer/src/index.ts`.

## Component prop types

| Type | Description | Source |
|------|-------------|--------|
| `TextProps` | Props for `<Text>` (color, styling, wrap mode) | `components/Text.tsx` |
| `DraggableProps` | Props for `<Draggable>`: `initialPos`, `bounds`, `disabled`, `onDragStart`/`onDrag`/`onDragEnd` | `components/Draggable.tsx` |
| `DropTargetProps` | Props for `<DropTarget>`: `accept`, `onDragEnter`/`onDragOver`/`onDragLeave`/`onDrop` | `components/DropTarget.tsx` |
| `ResizableProps` | Props for `<Resizable>`: `initialSize`, `minSize`/`maxSize`, `handles`, handle colors | `components/Resizable.tsx` |
| `FocusGroupProps` | Props for `<FocusGroup>`: `direction`, `wrap`, `isActive` | `components/FocusGroup.tsx` |
| `FocusGroupDirection` | `'row' \| 'column' \| 'both'` | `components/FocusGroup.tsx` |
| `FocusRingProps` | Props for `<FocusRing>`: `borderColorFocus`, `borderColorIdle`, `autoFocus` | `components/FocusRing.tsx` |
| `ScrollBoxHandle` | Imperative ref API on `<ScrollBox>`: `scrollTo`, `scrollBy`, `scrollToElement`, `scrollToBottom`, `getScrollTop`, `getScrollHeight`, `isSticky`, `subscribe`, `setClampBounds` | `components/ScrollBox.tsx` |
| `BorderTextOptions` | Options for `Styles.borderText` (label embedded in border) | `render-border.ts` |
| `MatchPosition` | Search-highlight match coordinate | `render-to-screen.ts` |

## Event types

| Type | Description | Source |
|------|-------------|--------|
| `InputEvent` | Carries `keypress: ParsedKey`, `key: Key`, `input: string` | `events/input-event.ts` |
| `Key` | Bag of booleans for special keys (arrows, return, ctrl, shift, ...) | `events/input-event.ts` |
| `ParsedKey` | Lower-level parsed-keypress shape from `parse-keypress` | `parse-keypress.ts` |
| `ClickEvent` | Left-click release: `col`, `row`, `localCol`, `localRow`, `cellIsBlank` | `events/click-event.ts` |
| `KeyboardEvent` | Bubbling key event: `key`, `ctrl`, `shift`, `meta`, `superKey`, `fn` | `events/keyboard-event.ts` |
| `FocusEvent` | `'focus'` / `'blur'` with `relatedTarget` | `events/focus-event.ts` |
| `MouseDownEvent` | Press event with `captureGesture(handlers)`, `localCol`/`localRow` | `events/mouse-event.ts` |
| `MouseMoveEvent` | Motion event during a captured gesture | `events/mouse-event.ts` |
| `MouseUpEvent` | Release event closing a captured gesture | `events/mouse-event.ts` |
| `GestureHandlers` | `{ onMove?, onUp? }` installed via `MouseDownEvent.captureGesture` | `events/mouse-event.ts` |

## Drag / drop types

| Type | Description | Source |
|------|-------------|--------|
| `DragPos` | `{ top, left }` cell offset relative to parent content edge | `components/Draggable.tsx` |
| `DragBounds` | `{ width, height }` clamp box for a draggable | `components/Draggable.tsx` |
| `DragInfo` | Lifecycle payload: `pos`, `startPos`, `delta`, `dropped?` | `components/Draggable.tsx` |
| `DropInfo` | Drop callback payload: data + cursor position | `drag-registry.ts` |

## Resize types

| Type | Description | Source |
|------|-------------|--------|
| `ResizeSize` | `{ width, height }` cell dimensions | `components/Resizable.tsx` |
| `ResizeHandleDirection` | `'s' \| 'e' \| 'se'` | `components/Resizable.tsx` |
| `ResizeInfo` | Lifecycle payload: `size`, `startSize`, `delta`, `direction` | `components/Resizable.tsx` |

## Hook return types

| Type | Description | Source |
|------|-------------|--------|
| `UseFocusOptions` | `{ autoFocus?: boolean }` | `hooks/use-focus.ts` |
| `UseFocusResult` | `{ ref, isFocused, focus }` | `hooks/use-focus.ts` |
| `UseFocusManagerResult` | `{ focused, focus, focusNext, focusPrevious, blur }` | `hooks/use-focus-manager.ts` |
| `TabStatusKind` | Return type of `useTabStatus` | `hooks/use-tab-status.ts` |

## Style types

| Type | Description | Source |
|------|-------------|--------|
| `Styles` | Full layout + visual style bag (see [styles.md](./styles.md)) | `styles.ts` |
| `Color` | `RGBColor \| HexColor \| Ansi256Color \| AnsiColor \| string` (theme key) | `styles.ts` |
| `TextStyles` | `color`, `backgroundColor`, `dim`, `bold`, `italic`, `underline`, `strikethrough`, `inverse` | `styles.ts` |
| `ColorType` | Color category tag returned by `colorize` helpers | `colorize.ts` |

## Renderer types

| Type | Description | Source |
|------|-------------|--------|
| `RenderOptions` | Render config: `stdout`, `stdin`, `stderr`, `exitOnCtrlC`, `patchConsole`, `onFrame` | `root.ts` |
| `Instance` | Returned from `render()` / `renderSync()`: `rerender`, `unmount`, `waitUntilExit`, `cleanup` | `root.ts` |
| `Root` | Returned from `createRoot()`: `render`, `unmount`, `waitUntilExit` | `root.ts` |
| `Frame` | A composed frame: `screen`, `viewport`, `cursor`, `scrollHint?`, `scrollDrainPending?` | `frame.ts` |
| `FrameEvent` | `onFrame` payload: `durationMs`, `phases`, `flickers` | `frame.ts` |

## DOM types

| Type | Description | Source |
|------|-------------|--------|
| `DOMElement` | Yokai's host element node (mutable, has scroll state, event handlers, Yoga node) | `dom.ts` |
| `DOMNode` | `DOMElement` or text node | `dom.ts` |

## Layout types

| Type | Description | Source |
|------|-------------|--------|
| `clamp` (function) | `(value, min, max) => number` | `layout/geometry.ts` |

`Rectangle`, `Point`, `Size`, and `Edges` from `layout/geometry.ts` are not re-exported through the public entry — import them from `@yokai/renderer/layout/geometry` if needed for internal extension work.
