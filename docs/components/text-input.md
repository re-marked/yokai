# TextInput

Editable text input. Single-line by default; pass `multiline` for newline-aware editing.

## Import
```tsx
import { TextInput } from '@yokai-tui/renderer'
```

## Props

Component-specific props. All `<Box>` props are accepted EXCEPT `onKeyDown`, `onPaste`, `onMouseDown`, `onClick` (the input owns those).

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `value` | `string` | — | Controlled value. When set, the input mirrors this exact string and emits `onChange` on edits. |
| `defaultValue` | `string` | `''` | Initial value when uncontrolled. Ignored after mount. |
| `onChange` | `(value: string) => void` | — | Called on every buffer change (typing, paste, delete, undo, redo). |
| `onSubmit` | `(value: string) => void` | — | Called on Enter (single-line) or Ctrl+Enter (multiline). |
| `onCancel` | `() => void` | — | Called on Escape. |
| `multiline` | `boolean` | `false` | Allow newlines. Enter inserts `'\n'`; Ctrl+Enter submits. |
| `maxLength` | `number` | `Infinity` | Cap on buffer length in characters. Insertions truncate to fit. |
| `placeholder` | `string` | — | Dimmed text shown when the buffer is empty. |
| `password` | `boolean` | `false` | Replace rendered chars with `passwordChar`. Caret math uses the real buffer. |
| `passwordChar` | `string` | `'•'` | Mask character for `password` mode. |
| `disabled` | `boolean` | `false` | Ignore keystrokes. The input still claims focus. |
| `selectionColor` | `Color` | `'cyan'` | Background of the selection highlight. |
| `borderColorFocus` | `Color` | `'cyan'` | Border color while focused. Swaps `borderColor` on focus, reverts on blur. No-op when no `borderStyle` is set. To opt out, pass the same value as `borderColor`. |
| `cursorStyle` | `'block' \| 'underline' \| 'bar'` | terminal default | Cursor shape while focused. DECSCUSR; restored to terminal default on blur. |
| `cursorBlink` | `boolean` | terminal default | Cursor blink while focused. Pairs with `cursorStyle`. |
| `cursorColor` | `Color` | terminal default | Cursor color while focused. OSC 12; supported by xterm/iTerm2/kitty/alacritty/Windows Terminal/VS Code. `ansi256(N)` not supported. |
| `autoFocus` | `boolean` | `false` | Focus on mount. |
| `historyCap` | `number` | `100` | Max undo entries. Older entries drop. |
| `wrap` | `'soft' \| 'none'` | multiline → `'soft'`, single-line → `'none'` | Soft-wrap long lines onto visual rows (`'soft'`) or keep one row per logical line (`'none'`, h-scrolls past width). See [Soft-wrap](#soft-wrap). |
| `indentedWrap` | `boolean` | `true` | Hanging indent: continuation rows of an indented logical line align under the first non-whitespace char. See [Advanced wrap control](#advanced-wrap-control). |
| `wordBoundaries` | `'whitespace' \| 'identifier'` | `'whitespace'` | Where wrap is allowed to break. `'identifier'` adds snake_case / kebab-case / camelCase break candidates and treats URLs as atomic. See [Advanced wrap control](#advanced-wrap-control). |
| `wrapHints` | `ReadonlyArray<WrapHint>` | — | Programmatic atomic spans — buffer-relative ranges the wrap algorithm must NOT break inside. Memoize the array reference. See [Advanced wrap control](#advanced-wrap-control). |
| `autoGrow` | `boolean` | `false` | Multiline only. Box height grows to fit content (visual rows + border + padding). Combine with yoga `maxHeight` to bound. Beyond `maxHeight`, scrollY kicks in. See [Auto-grow](#auto-grow). |
| `validate` | `(value: string) => string \| null` | — | Validation function. Return a non-empty message to mark the input invalid (border swaps to `errorColor`, message renders below the content). Return `null` or `''` for valid. See [Validation](#validation). |
| `errorColor` | `Color` | `'red'` | Border + default message color when validation fails. Border-color precedence: error > focus > idle. |
| `renderError` | `(message: string) => ReactNode` | dim red `<Text>` | Custom error-message renderer. Called only when `validate` returned a non-null message. |

## Examples

### Single-line, controlled
```tsx
const [name, setName] = useState('')
<TextInput
  value={name}
  onChange={setName}
  placeholder="Type your name…"
  onSubmit={(v) => console.log('submitted', v)}
/>
```

### Multiline
```tsx
<TextInput
  defaultValue=""
  multiline
  height={6}
  onSubmit={(v) => save(v)} // Ctrl+Enter
/>
```

### Password
```tsx
<TextInput value={pw} onChange={setPw} password />
```

### Custom focus color
```tsx
<TextInput
  value={query}
  onChange={setQuery}
  borderStyle="round"
  borderColor="gray"      // idle
  borderColorFocus="green" // focused
/>
```

### Disable focus chrome (use a sibling indicator instead)
```tsx
<TextInput
  value={x}
  onChange={setX}
  borderStyle="round"
  borderColor="gray"
  borderColorFocus="gray" // same as idle → no swap
/>
```

## Key bindings

| Action | Single-line | Multiline |
|--------|-------------|-----------|
| Insert char | Type | Type |
| Insert newline | — | Enter |
| Submit | Enter | Ctrl+Enter |
| Cancel | Escape | Escape |
| Delete back | Backspace | Backspace |
| Delete forward | Delete | Delete |
| Delete word back | Ctrl+Backspace, Ctrl+W | same |
| Delete to line start | Ctrl+U | same |
| Delete to line end | Ctrl+K | same |
| Move char | ←/→ | ←/→ |
| Move line | — | ↑/↓ |
| Move word | Ctrl+←/→ | same |
| Move to line edge | Home / End | same |
| Move to doc edge | Ctrl+Home / Ctrl+End | same |
| Extend selection | Shift + any movement | same |
| Select all | Ctrl+A | same |
| Undo | Ctrl+Z | same |
| Redo | Ctrl+Y, Ctrl+Shift+Z | same |

## Behavior

- **Controlled vs uncontrolled.** Pass `value` for controlled mode (parent owns the buffer); pass `defaultValue` for uncontrolled (the input owns it). External `value` changes reset internal state — undo across an external set isn't a useful semantic.
- **Caret rendering.** The real terminal cursor is positioned at the caret via `useDeclaredCursor`, so IME composition popups and screen readers follow correctly. No synthetic glyph.
- **Caret is logical.** `state.caret` (and the `value` you receive in `onChange`) are LOGICAL — buffer char indices, wrap-agnostic. The internal layout translates between logical positions and visual rows on each render; consumers never see visual coords.
- **Smart paste.** Short pastes (≤ `<AlternateScreen pasteThreshold>`, default 32 chars) come through as a stream of keystrokes — they feel like typing. Longer pastes fire `onPaste` and become one undo step.
- **Single-line + newlines.** Pasting multiline content into a single-line input converts newlines to spaces (the alternative — silently dropping them — would corrupt the user's intent).
- **Undo grouping.** Consecutive same-kind insertions or deletions merge into one undo step (a typed word is one Ctrl+Z, not N). Pastes are always their own step.
- **Wide chars.** Caret math counts CJK / wide chars as 2 cells, combining marks as 0. Click positioning snaps to the LEFT edge of a wide char if the click lands mid-glyph.

## Soft-wrap

Multiline TextInput soft-wraps long lines onto VISUAL ROWS by default; single-line stays on one row and scrolls horizontally. Two terms to keep straight:

- **Logical line** — text between two `\n`s (or buffer edges). Owned by `state.value`; what `onChange` reports.
- **Visual row** — a slice of a logical line that fits on one screen row. Computed each render from the inner width.

The caret moves through visual rows: ↓ takes you to the next visual row even if it's a wrap continuation of the same logical line, not the next `\n`. Selection paints as one continuous stripe across multi-row spans, including the slack at row ends so a multi-row selection reads as one connected block. Empty logical lines (consecutive `\n`s) get a single zero-cell visual row each so the caret can land on them.

### Defaults

| Mode | `wrap` default | What it does |
|------|----------------|--------------|
| `multiline` | `'soft'` | Long lines wrap onto continuation rows. Vertical scroll only; no horizontal scroll. |
| Single-line | `'none'` | Content stays on one row; horizontal scroll keeps the caret in view. |

To override: pass `wrap='none'` on a multiline input to disable wrapping (truncates + h-scrolls per row), or `wrap='soft'` on a single-line input (rare — single-line content rarely benefits).

### Caret nav under soft-wrap

- **↓ / ↑** walk visual rows in display order. A wrapped logical line's continuation row counts as the row below the first row.
- **Preferred column.** When you press ↓ from a wide row, the column is captured. Subsequent ↓ presses preserve that column even when passing through SHORTER rows that clamp the caret to row end. The first horizontal move (←/→/Home/End/etc.) or any edit resets the captured column.
- **Home / End** still operate on LOGICAL line boundaries — Home goes to the start of the current logical line (which may be on an earlier visual row if you're on a continuation).

## Advanced wrap control

Three props tune how soft-wrap decides where to break.

### `indentedWrap` (boolean, default `true`)

Hanging indent: when a logical line begins with leading whitespace, continuation rows are decorated with the same indent so wrapped content aligns under the first non-whitespace char of the original line. Mirrors vim's `breakindent`.

```
*  This is a long bulleted item that wraps onto a continuation row,
   and the continuation aligns under "This" instead of column 0.
```

**Threshold.** The indent must leave at least `width / 2` cells of usable content per row. If not (very narrow box or very deep indent), the indent decoration is omitted on continuation rows for that line — graceful degrade rather than producing 1-char-wide rows.

**Tab caveat.** Tab-only indent does NOT trigger hanging indent. `stringWidth` treats `\t` as 0 cells (no width metric available without a configured `tabWidth` — see [Deferred](#deferred)). Mix tab + space and the space portion still drives the indent.

Pass `indentedWrap={false}` to disable globally — continuation rows start at column 0 regardless of leading whitespace.

### `wordBoundaries` (`'whitespace' | 'identifier'`, default `'whitespace'`)

In `'whitespace'` mode, wrap math breaks only at whitespace. In `'identifier'` mode, additional break candidates open up for identifier-shaped tokens:

| Pattern | Break preference |
|---------|------------------|
| `snake_case` | break AFTER `_` |
| `kebab-case` | break AFTER `-` |
| `camelCase` / `PascalCase` | break BEFORE an uppercase that follows lowercase |
| URL (`https://…`, `http://…`) | atomic — never break inside |

Whitespace breaks always beat identifier breaks at the same row-end (a hard break is preferred over a preferred break). Reach for `'identifier'` on fields where users type slash commands, identifier names, file paths, or URLs — content that benefits from breaking at semantic boundaries when it overflows instead of mid-token.

```tsx
<TextInput
  multiline
  wordBoundaries="identifier"
  defaultValue="/sling --target=backend-engineer --link=https://github.com/foo/bar"
/>
```

### `wrapHints` (`ReadonlyArray<WrapHint>`, optional)

Programmatic atomic spans — buffer-relative ranges the wrap algorithm must NOT break inside. Use for things a parser knows about: mention chips, rich-text tokens, code identifiers, file paths the consumer wants kept whole regardless of boundary heuristics.

```tsx
import { type WrapHint } from '@yokai-tui/renderer'

const hints = useMemo<ReadonlyArray<WrapHint>>(
  () => [
    { start: 0, end: 6 },    // @toast
    { start: 11, end: 23 },  // chit-abc-123
  ],
  [],
)

<TextInput value={value} onChange={setValue} multiline wrapHints={hints} />
```

**Memoize the array reference.** `wrapHints` participates in the layout's `useMemo` deps. Passing a fresh array every render forces a layout recompute even when the buffer didn't change. Use `useMemo` (or a ref-stable derive) and let your hint contents change only when the buffer does.

**Span > width.** If a hinted span is wider than the inner cell width, it overflows on its own row rather than splitting — same contract URL detection in `'identifier'` mode follows. The renderer truncates the visible portion at row width; the buffer is intact.

**Hint indices are buffer-relative.** A hint covering `chit-abc-123` at idx 11-23 stops being meaningful after the user inserts characters before idx 11. In a real app, derive hints from a parser running on `state.value` — don't hardcode against the initial value.

The `WrapHint` type accepts an optional `joinWith?: string` field, but it's reserved and not yet implemented (renderer-side glyph injection at wrap continuations — coming in a follow-up).

### Deferred

These are documented gaps, not bugs:

- **`joinWith` on hints** — renderer-side glyph injection at wrap continuations (e.g., showing a `↪` at the start of a wrapped row inside a hint). The type field is accepted but ignored.
- **Configurable `tabWidth`** — tabs currently report 0 cells via `stringWidth`. A future option would let consumers pick a tab width for measurement (and unblock tab-only hanging indent).

## Auto-grow

Multiline TextInput can grow its box height to fit the wrapped content instead of being pinned to a fixed `height`. Useful for fields where you don't know how much the user will type — comment boxes, notes, message composers.

```tsx
<TextInput
  value={notes}
  onChange={setNotes}
  multiline
  autoGrow
  maxHeight={8}    // grows from 1 row up to 8 outer rows; then scrolls
  borderStyle="round"
  paddingX={1}
  width={50}
/>
```

### Behavior

- **Activation.** Auto-grow turns on when `autoGrow={true}` AND `multiline={true}` AND no explicit `height` is passed. If you set `height`, that wins (auto-grow is suppressed) — useful when you want a fixed-size field but accidentally left the prop on a shared TextInput wrapper.
- **What "outer rows" means.** The derived height is `visual rows + vertical chrome` (border = 1 cell per side when `borderStyle` is set; padding from `padding` / `paddingY` / `paddingTop` / `paddingBottom`). So a 3-row buffer with `borderStyle='round'` + `paddingY={1}` produces a 7-cell-tall outer box (3 content + 2 border + 2 padding).
- **Bounds via yoga.** Use the standard yoga style props `minHeight` / `maxHeight` to bound growth. They're already on Box; no new props needed. Beyond `maxHeight`, the existing `scrollY` path takes over and the caret stays visible.
- **Empty buffer.** wrap-math emits one zero-cell row for the empty case, so the auto-grown height is always at least `1 + chrome`. To require a taller minimum (e.g., always show 3 rows even when empty), set `minHeight` to your floor.
- **Single-line.** Auto-grow is multiline-only; single-line inputs are always 1 row regardless of the prop. Setting `autoGrow={true}` on a single-line input is a no-op (not an error).
- **Resize behavior.** When the terminal width changes, the wrap layout recomputes and so does the row count — the box rewraps and re-grows in the same frame. One-frame jank is possible on the first paint after a width change; in practice it's invisible.

### Why this works (vs. Resizable's autoFit)

`<Resizable>` previously attempted "auto-fit content" twice and reverted both times because it relied on yoga's `getComputedHeight`, which is one frame stale (yoga's `calculateLayout` runs AFTER `useLayoutEffect`). TextInput's auto-grow doesn't have this problem: the wrap-math primitive already knows the row count for any `(value, width)` pair — no yoga round-trip needed for the height.

The cycle is also stable: row count depends on `(value, inner.width)`, not on the box's height. Setting the box's height does not feed back into the row count, so width-independent layouts (the common case — explicit `width`, or column flex) converge in one extra frame and stay there.

### Caveats

- **Numeric chrome only.** The vertical chrome calculation handles numeric `padding` / `paddingY` / `paddingTop` / `paddingBottom`. String / percentage padding falls through as 0 cells — auto-grow assumes cell-based chrome. If you need string padding with auto-grow, set explicit `height` instead.
- **Per-side borders.** `borderStyle` counts 1 cell per side (top + bottom). Per-side border control is not separately supported in the chrome calc.

## Validation

Pass a `validate` function to mark the input invalid based on its current value. The border swaps to `errorColor` and the message renders below the input content (inside the bordered box, via the input's existing `flexDirection="column"`).

```tsx
<TextInput
  value={slug}
  onChange={setSlug}
  borderStyle="round"
  validate={(v) => {
    if (v.length === 0) return null            // don't show error before user types
    if (v.length < 3) return `${v.length}/3 characters minimum`
    if (!/^[a-z0-9-]+$/.test(v)) return 'lowercase letters, digits, and hyphens only'
    return null
  }}
/>
```

### Behavior

- **Render-only.** `onSubmit` still fires when invalid. To block submit on error, check the validation result in your `onSubmit` handler before acting:
  ```tsx
  onSubmit={(v) => {
    if (validate(v)) return
    save(v)
  }}
  ```
- **Runs every render.** No internal debounce — if the check is expensive, debounce inside the function (e.g., with a memoized regex) or gate it on a parent state condition.
- **Empty string is treated as null.** Returning `''` from `validate` does NOT show an error with no message — that's almost always a bug. Be explicit: return `null` when valid.
- **Border-color precedence**: error > focus > idle. A focused, invalid input keeps the red border (the focus-color swap is suppressed) so the validation state stays visible.
- **Show-when-touched pattern**: return `null` while the buffer is empty / pristine, then start returning real errors once the user has typed. Yokai doesn't track a "touched" flag for you — manage it in the parent if you need that semantic.

### Custom message rendering

The default message renders as a dim `<Text color={errorColor}>`. Pass `renderError` for full control — icons, multi-line, layout:

```tsx
<TextInput
  value={x}
  onChange={setX}
  validate={(v) => v.length === 0 ? 'required' : null}
  renderError={(msg) => (
    <Text color="red">⚠ {msg}</Text>
  )}
/>
```

For error rendering OUTSIDE the bordered box (above the input, in a sibling status bar, etc.), call `validate` yourself in the parent and render a `<Text>` separately — `validate` on `<TextInput>` is for the inside-the-box default, not a general validation framework.

### Async validation

Not built in. The signature is sync (`string | null`), not `Promise<string | null>`. Async validation needs debouncing, race-condition handling, and a "validating…" intermediate state — those decisions belong in your parent state, not in `<TextInput>`. Pattern:

```tsx
const [asyncError, setAsyncError] = useState<string | null>(null)
useEffect(() => {
  const id = setTimeout(async () => {
    setAsyncError(await checkAvailability(value))
  }, 300)
  return () => clearTimeout(id)
}, [value])

<TextInput
  value={value}
  onChange={setValue}
  validate={() => asyncError}
/>
```

## Scrolling

- **Single-line** (or multiline with `wrap='none'`): when content exceeds the box width, the visible window scrolls horizontally so the caret stays in view. Wide chars at the visible edges render as spaces to keep cell layout stable; selection highlight on a horizontally-scrolled wide char is rendered approximately.
- **Multiline with `wrap='soft'`** (the default): content wraps to fit width — no horizontal scroll. When the wrapped content exceeds box height, the visible window scrolls vertically so the caret's visual row stays in view.
- The inner content area is read from yoga's computed size minus padding + border, so `width` / `height` props refer to the OUTER box. If you don't pass `width` / `height`, no scrolling — content fills the box's natural size.

## Known limitations

- IME composition is not yet handled — multi-byte composition sequences from CJK / Korean IMEs may produce intermediate state. Committed text works correctly.
- Selection highlight may render approximately when it crosses a horizontally-scrolled wide character boundary.
- Click positioning doesn't subtract padding/border from the click coordinates — clicks within padding may snap to the wrong char by the padding amount.

## Related
- [Keyboard concept](../concepts/keyboard.md)
- [Smart paste in events.md](../concepts/events.md)
- [`<FocusGroup>`](focus-group.md) — wrap a form in one for Tab navigation between TextInputs

## Source
[`packages/renderer/src/components/TextInput/`](../../packages/renderer/src/components/TextInput/)
