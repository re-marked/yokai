# Selection

Mouse-driven text selection over the alt-screen buffer with anchor/focus tracking, drag-to-scroll virtual rows, and copy semantics that survive soft-wraps and viewport scrolling.

## Anchor and focus

Selection is stored as two screen-buffer points:

- `anchor` — where the mouse-down occurred
- `focus` — current drag position; null between mouse-down and first motion

A bare click leaves `focus` null, so `hasSelection` returns false and no cell is highlighted. `selectionBounds` normalizes the pair into reading-order `(start, end)` for rendering and copy.

Selection state is owned by `Ink`, not React. Mouse events mutate `SelectionState` directly via `startSelection` / `updateSelection` / `finishSelection` and apply the highlight as a per-cell style swap (`applySelectionOverlay`) before the frame diff runs. This survives React re-renders because the state lives outside the reconciler.

## Word and line modes

Double-click expands to the word at the cursor; triple-click expands to the row. Both set `anchorSpan` so subsequent drag extends word-by-word or line-by-line, with the original word/line staying inside the selection even when dragging backward past it.

Word boundaries follow iTerm2's defaults (letters, digits, `_/.-+~\`) so paths like `~/.claude/config.json` select as one token.

## Virtual rows

When the user drags past a viewport edge, the ScrollBox scrolls and the anchor (or both endpoints) clamp to the visible range. `virtualAnchorRow` / `virtualFocusRow` track the pre-clamp positions so a reverse scroll restores the true position and pops the right number of entries from the scrolled-off accumulators. Without virtual tracking, PgDn-then-PgUp would leave the highlight at the wrong row and the copied text out of sync with the visible highlight.

## Scrolled-off accumulators

The screen buffer only holds the current viewport. As rows scroll out during drag-to-scroll, `captureScrolledRows` extracts the selected text from those rows along with their soft-wrap bits before they get overwritten. `scrolledOffAbove` / `scrolledOffBelow` and their parallel `*SW` arrays are prepended/appended by `getSelectedText` so the copy reflects the full selection even when most of it is no longer visible.

## NoSelect regions

`<NoSelect>` (or `Box noSelect`) marks cells as exclusion zones. `applySelectionOverlay` skips them so gutters stay visually unchanged during drag, and `extractRowText` skips them so the copy is clean pasteable content.

```tsx
<Box flexDirection="row">
  <NoSelect fromLeftEdge><Text dimColor> 42 +</Text></NoSelect>
  <Text>const x = 1</Text>
</Box>
```

`fromLeftEdge` extends the exclusion from column 0, useful for gutters inside indented containers.

## Copy semantics

`getSelectedText` joins rows with `\n`, but rows where `screen.softWrap[row] > 0` are concatenated onto the previous row — the copied text matches the logical source line, not the visual wrapped layout. Trailing whitespace on the last fragment of each logical line is trimmed. Wide-char spacer cells are skipped.

Only active in alt-screen with mouse tracking enabled. In main-screen mode the terminal's native selection takes over.

## See also
- [Scrolling](../concepts/scrolling.md)
- [Terminals](../concepts/terminals.md)
- [NoSelect](../components/no-select.md)
- [AlternateScreen](../components/alternate-screen.md)
