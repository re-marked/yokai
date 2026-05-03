import type React from 'react'
import {
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react'
import type { Except } from 'type-fest'
import type { DOMElement } from '../../dom.js'
import type { KeyboardEvent } from '../../events/keyboard-event.js'
import type { MouseDownEvent } from '../../events/mouse-event.js'
import type { PasteEvent } from '../../events/paste-event.js'
import { useClipboard } from '../../hooks/use-clipboard.js'
import { useDeclaredCursor } from '../../hooks/use-declared-cursor.js'
import { LayoutEdge } from '../../layout/node.js'
import { stringWidth } from '../../stringWidth.js'
import type { Color } from '../../styles.js'
import type { CursorStyle } from '../../termio/dec.js'
import Box, { type Props as BoxProps } from '../Box.js'
import FocusContext from '../FocusContext.js'
import Text from '../Text.js'
import { clipboardKeyAction } from './clipboard-action.js'
import { scrollToKeepCaretVisible, sliceRowByCells } from './scroll-math.js'
import {
  type Action,
  type ReducerOptions,
  type TextInputState,
  initialState,
  reduce,
  selectionOrCaretRange,
} from './state.js'
import {
  type WordBoundaryMode,
  type WrapHint,
  type WrapLayout,
  buildWrapLayout,
} from './wrap-math.js'

export type TextInputProps = Except<
  BoxProps,
  // We own keyboard / paste / mouse handling — overriding these
  // would conflict with caret math.
  'onKeyDown' | 'onPaste' | 'onMouseDown' | 'onClick'
> & {
  /** Controlled value. When set, the input reflects this exact string
   *  and fires `onChange` on edits. Caller is responsible for echoing
   *  the change back via state. */
  value?: string
  /** Initial value when uncontrolled. Ignored after mount; use `value`
   *  for controlled mode if you need to reset. */
  defaultValue?: string
  /** Called whenever the buffer changes — typing, pastes, deletes,
   *  undo, redo. The new value is the only argument. */
  onChange?: (value: string) => void
  /** Called when the user submits: Enter in single-line, Ctrl+Enter
   *  in multiline. Receives the current value. */
  onSubmit?: (value: string) => void
  /** Called on Escape. Useful for closing modals / cancelling edits. */
  onCancel?: () => void
  /** Allow newlines in the buffer. Enter inserts a newline; Ctrl+Enter
   *  submits. Default false (single-line). */
  multiline?: boolean
  /**
   * Wrap mode.
   *
   * - `'soft'` — long lines wrap onto continuation rows. Word boundaries
   *   used by default; tunable via `wordBoundaries` and `wrapHints`.
   *   Hanging indent on wraps via `indentedWrap` (default on).
   * - `'none'` — long lines DON'T wrap. Single-line scrolls horizontally
   *   to keep the caret visible; multiline truncates each logical line
   *   at the box's right edge AND scrolls horizontally as the caret
   *   moves past the visible window.
   *
   * Default depends on `multiline`: `'soft'` when multiline (matches
   * `<textarea>`'s wrap default); `'none'` when single-line (matches
   * `<input>`, vim's default, every modern editor's "Name field"-style
   * input). Pass `wrap` explicitly to override either way — for instance
   * a single-line code-snippet field that should grow vertically can
   * set `wrap='soft'`, and a multiline address field that should never
   * wrap can set `wrap='none'`.
   */
  wrap?: 'soft' | 'none'
  /**
   * When `wrap='soft'`, continuation rows of a wrapped logical line
   * visually align under the first non-whitespace character of the
   * original line — vim's `breakindent`, VS Code's "wrap with
   * indent." Default `true` (enabled), matching what every modern
   * editor does for prose / list / quote / indented-code content.
   *
   * Set `false` for the unindented behavior (continuation rows start
   * at column 0). Useful when the consumer wants raw column-0 wrap
   * for terminal-style content like log lines.
   *
   * Threshold: indent only applies when the indent leaves at least
   * width / 2 cells of content room — beyond that the indent gets
   * abandoned automatically. No-op when `wrap='none'`.
   */
  indentedWrap?: boolean
  /**
   * Word-boundary detection mode for wrap break-points (only applies
   * when `wrap='soft'`).
   *
   * - `'whitespace'` (default): wrap breaks only at standard
   *   whitespace (space, tab). The simplest, fastest mode — fits
   *   most prose / chat / form-field content.
   * - `'identifier'`: also breaks at `_` / `-` boundaries
   *   (snake_case, kebab-case) and at lowercase→uppercase
   *   transitions (camelCase, PascalCase). Treats URLs
   *   (`http(s)://...`) as atomic — never breaks inside them.
   *   Tuned for code-like + CLI command content (slash commands
   *   with flags, file paths, identifiers).
   */
  wordBoundaries?: WordBoundaryMode
  /**
   * Programmatic wrap hints — buffer-relative atomic spans that the
   * wrap algorithm must NOT break inside. Useful for keeping
   * semantically-atomic content together: mention chips (`@toast`),
   * chit-id refs (`chit-abc-123`), inline code spans, etc.
   *
   * Hints intersect each logical line's range automatically (the
   * wrap-math primitive clips to per-line ranges). Empty / inverted
   * ranges (`end <= start`) are silently ignored.
   *
   * **Memoize the array reference.** This prop is in the layout
   * useMemo's dep array — passing a fresh array every render forces
   * a layout recompute on every render (O(N) over the buffer).
   * `useMemo([dependencies])` it consumer-side, or hoist a stable
   * reference, OR accept the recompute if the buffer is small.
   *
   * No-op when `wrap='none'` (no wrap, no break-points, no hints
   * to honor).
   */
  wrapHints?: ReadonlyArray<WrapHint>
  /** Cap on buffer length in characters. Default unlimited. */
  maxLength?: number
  /** Render placeholder text dimmed when the buffer is empty. */
  placeholder?: string
  /** When true, all rendered chars are replaced with `passwordChar`.
   *  Caret math still operates on the real buffer. Default false. */
  password?: boolean
  /** Mask character used when `password` is true. Default `'•'`. */
  passwordChar?: string
  /** Disable input. The input still renders + claims focus, but
   *  keystrokes don't mutate the buffer. */
  disabled?: boolean
  /** Selection background color. Default the renderer's terminal-default
   *  selection background (typically inverse). */
  selectionColor?: Color
  /**
   * Border color when the input is focused. Default `'cyan'`.
   *
   * The input swaps its `borderColor` for this value while focused,
   * and reverts to the idle color (whatever was passed via
   * `borderColor`, or the terminal default) on blur. Requires a
   * `borderStyle` to be set — without a border there's nothing to
   * color, so the swap is a no-op.
   *
   * To opt out of the focus-color swap (e.g. when focus is indicated
   * elsewhere — a status bar, a sibling chrome element), pass the
   * same value as `borderColor`. Setting both to the same value
   * keeps the border static across focus transitions.
   */
  borderColorFocus?: Color
  /**
   * Terminal cursor shape while this input is focused. Default
   * undefined — the user's terminal-configured cursor wins.
   *
   * 'block' is the classic full-cell rectangle, 'underline' is the
   * vt220 underscore, 'bar' is the modern editor caret. Emitted via
   * DECSCUSR (`CSI Ps SP q`); ink restores the terminal default
   * automatically when the input blurs / unmounts so the user's
   * shell isn't left with our shape.
   */
  cursorStyle?: CursorStyle
  /**
   * Whether the cursor blinks while this input is focused. Default
   * undefined — the user's terminal-configured blink wins.
   *
   * Pairs with `cursorStyle` in the DECSCUSR sequence — DECSCUSR
   * can't set just one half. Setting `cursorBlink` alone defaults
   * `cursorStyle` to `'block'`; setting `cursorStyle` alone defaults
   * `cursorBlink` to `true`.
   */
  cursorBlink?: boolean
  /**
   * Cursor color while this input is focused. Default undefined —
   * the user's terminal-configured cursor color wins. Emitted via
   * OSC 12; ink restores the default automatically on blur / unmount.
   *
   * Most modern terminals (xterm, iTerm2, kitty, alacritty, Windows
   * Terminal, VS Code) honor it. `ansi256(N)` colors aren't supported
   * by the OSC 12 syntax — use hex (`'#00ff00'`), `rgb(...)`, or
   * named colors.
   */
  cursorColor?: Color
  /** Auto-focus on mount. */
  autoFocus?: boolean
  /** Maximum history entries kept for undo/redo. Default 100. */
  historyCap?: number
  /**
   * Auto-grow the box height to fit the wrapped content. When `true`
   * AND `multiline` is set AND no explicit `height` is passed, the box
   * sizes to the visual-row count (plus border + padding chrome).
   * Combine with the standard `minHeight` / `maxHeight` yoga style
   * props to bound growth — beyond `maxHeight`, the existing vertical
   * scroll kicks in to keep the caret visible.
   *
   * Default `false` for backwards compatibility (existing multiline
   * consumers passing explicit `height` see no change). Single-line
   * inputs ignore this prop — they're always 1 row.
   *
   * Implementation note: row count comes from the wrap-math primitive
   * directly, not from yoga's measured height — the wrap layout
   * already knows how many rows the buffer produces at the current
   * inner width. That sidesteps yoga's "computed-before-render" stale-
   * measurement problem (the same issue that defeated Resizable's
   * `autoFit` twice). The only one-frame flash is on initial mount,
   * before yoga has measured the inner width — the box renders at
   * minHeight (or yoga's default), then reflows to derived height on
   * the next frame.
   *
   * Chrome computation handles numeric `padding`, `paddingY`,
   * `paddingTop`, `paddingBottom`, and `borderStyle` (1 cell per
   * border side). String / percentage padding falls through as 0 cells
   * — auto-grow assumes cell-based chrome. If you need string padding
   * with auto-grow, set explicit `height` instead.
   */
  autoGrow?: boolean
  /**
   * Validation function. Called with the current buffer on every
   * render; return a non-empty string to mark the input invalid (the
   * border swaps to `errorColor` and the message renders below the
   * input content), or `null` / `''` for valid.
   *
   * Validation is purely a RENDER concern — `onSubmit` still fires when
   * invalid. To block submit on error, check the validation result in
   * your `onSubmit` handler before acting.
   *
   * Runs every render. If the check is expensive, debounce / memoize
   * inside the function — the component doesn't try to be clever about
   * skipping calls.
   *
   * Empty string is treated as `null` (valid) so consumers can't
   * accidentally enable error styling with no message — be explicit
   * and return null when valid.
   */
  validate?: (value: string) => string | null
  /**
   * Border + default message color when validation fails. Default
   * `'red'`. Border-color precedence: error > focus > idle.
   *
   * Only honored when `validate` is set AND returns a non-empty
   * message; otherwise the input renders with its normal focus / idle
   * border color.
   */
  errorColor?: Color
  /**
   * Custom error-message renderer. When omitted, the message renders
   * as a dim `<Text color={errorColor}>` below the input content
   * (inside the bordered box).
   *
   * Use for icons (`⚠ ${message}`), multi-line messages, or any layout
   * the default text node can't express. The function is called only
   * when `validate` returned a non-null message.
   */
  renderError?: (message: string) => React.ReactNode
}

/**
 * Editable text input. Single-line by default; pass `multiline` for a
 * multi-line buffer with ↑/↓ navigation. Built on top of the pure
 * state machine in `./state.ts` — every keystroke routes through a
 * reducer action, and the React component is a thin shell around it.
 *
 * **Editing**: type, Backspace, Delete, ←/→, ↑/↓ (multiline), Home,
 * End, Ctrl+←/→ (word nav), Ctrl+W (delete word back), Ctrl+U (delete
 * line back), Ctrl+K (delete line forward), Ctrl+A (select all),
 * Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z (undo/redo).
 *
 * **Selection**: Shift+arrows extend; mouse drag extends; click
 * positions the caret.
 *
 * **Submit**: Enter (single-line) or Ctrl+Enter (multiline). Escape
 * triggers `onCancel`.
 *
 * **Paste**: short pastes (≤ `<AlternateScreen pasteThreshold>`,
 * default 32 chars) come through as a stream of keystrokes — they
 * feel like typing. Long pastes fire the `onPaste` event the input
 * subscribes to internally and become one undo step.
 *
 * **Caret rendering**: the real terminal cursor is positioned at the
 * caret via `useDeclaredCursor`, so IME composition popups + screen
 * readers follow correctly. No synthetic caret glyph.
 */
export default function TextInput({
  value,
  defaultValue,
  onChange,
  onSubmit,
  onCancel,
  multiline = false,
  wrap,
  indentedWrap = true,
  wordBoundaries = 'whitespace',
  wrapHints,
  maxLength,
  placeholder,
  password = false,
  passwordChar = '•',
  disabled = false,
  selectionColor = 'cyan',
  borderColorFocus = 'cyan',
  cursorStyle,
  cursorBlink,
  cursorColor,
  autoFocus = false,
  historyCap,
  autoGrow = false,
  validate,
  errorColor = 'red',
  renderError,
  ...boxProps
}: PropsWithChildren<TextInputProps>): React.ReactNode {
  const isControlled = value !== undefined
  // Wrap mode default depends on multiline: 'soft' for textarea-style,
  // 'none' for input-style. Single-line consumers who want vertical
  // wrap can opt in via wrap='soft'; multiline consumers who want a
  // single visible logical line per row can opt out via wrap='none'.
  const effectiveWrap = wrap ?? (multiline ? 'soft' : 'none')

  // optsRef MUST be declared before useReducer. On a render that has
  // queued dispatches, useReducer drains them by calling the reducer
  // immediately — which reads optsRef.current. With the ref declared
  // AFTER useReducer in render order, the reducer would hit a TDZ
  // ("Cannot access 'optsRef' before initialization") when the React
  // Compiler-transformed code re-enters this scope.
  const optsRef = useRef<ReducerOptions>({ multiline, maxLength, historyCap, width: 0 })
  // Mutate inline so the next dispatch sees the latest props without a
  // re-renders-update-state-before-effects round trip. Width is updated
  // separately AFTER `inner` is declared (see the matching mutation in
  // the Scroll section) — `inner.width` isn't in scope yet here.
  // Wrap-related options (indentedWrap, wordBoundaries, hints) MUST
  // mirror the renderer's so visual-row Up/Down nav lands where the
  // user sees the row break.
  optsRef.current = {
    multiline,
    maxLength,
    historyCap,
    width: optsRef.current.width,
    indentedWrap,
    wordBoundaries,
    hints: wrapHints,
  }

  // Reducer bridge — the React-shape (state, action) => state, closing
  // over the ref so opts changes propagate to the next dispatch.
  const reducerWithOpts = useCallback(
    (s: TextInputState, a: Action): TextInputState => reduce(s, a, optsRef.current),
    [],
  )

  const [state, dispatch] = useReducer(
    reducerWithOpts,
    isControlled ? value : (defaultValue ?? ''),
    initialState,
  )

  // Controlled-mode loop avoidance: track the last value we reported
  // (or were initialized with). The two effects below use this single
  // ref to avoid the classic ping-pong where:
  //   - user types → state updates → onChange fires
  //   - parent setState updates the prop
  //   - sync sees prop !== state, resets state to prop
  //   - onChange fires again with the reset value
  //   - parent setState again → infinite loop at 60Hz.
  //
  // The ref records "what the parent's value prop should be after
  // they echo our last report." Sync only fires when the prop differs
  // from THAT — meaning the parent set value externally, not just
  // hasn't echoed yet. onChange skips if state matches the ref —
  // meaning the change came FROM a sync, not a user edit.
  const lastReportedValue = useRef<string>(isControlled ? value! : (defaultValue ?? ''))

  // Sync internal state when the parent SETS value to something we
  // didn't just report. Deps are [value] only — state.value would
  // re-fire this effect on every keystroke, defeating the loop guard.
  // The closure-captured state.value is fine for the no-op skip
  // because if state.value already matches the new prop value, we
  // don't need to dispatch.
  // biome-ignore lint/correctness/useExhaustiveDependencies: state.value is read for an idempotency check only — including it would re-fire the sync on every keystroke and break the controlled-mode loop guard above.
  useEffect(() => {
    if (!isControlled) return
    if (value === lastReportedValue.current) return // we reported this
    if (value === state.value) return // already in sync somehow
    lastReportedValue.current = value!
    // Replace selection-all with insert; clears history because an
    // external set isn't a user-undoable edit.
    dispatch({ type: 'selectAll' })
    dispatch({ type: 'insertText', text: value!, isPaste: false })
  }, [isControlled, value])

  // Fire onChange when internal state diverges from the last reported
  // value (i.e. user-initiated change). Skip if the change came from
  // the controlled-sync effect above — that path updates
  // lastReportedValue first, so this comparison short-circuits.
  useEffect(() => {
    if (state.value === lastReportedValue.current) return
    lastReportedValue.current = state.value
    onChange?.(state.value)
  }, [state.value, onChange])

  // ── Inner content measurement ──────────────────────────────────────
  //
  // The wrap layout + scroll math both need to know the box's inner
  // content area (width × height net of border + padding). Read from
  // yoga via measureInnerSize() each commit. The value is one frame
  // stale (calculateLayout runs AFTER useLayoutEffect), but for typing
  // the lag is invisible because each keystroke triggers another
  // render that catches up.
  const ref = useRef<DOMElement>(null)
  const [inner, setInner] = useState({ width: 0, height: 0, offsetX: 0, offsetY: 0 })
  useLayoutEffect(() => {
    const node = ref.current
    if (!node?.yogaNode) return
    const measured = measureInnerSize(node)
    if (
      measured.width !== inner.width ||
      measured.height !== inner.height ||
      measured.offsetX !== inner.offsetX ||
      measured.offsetY !== inner.offsetY
    ) {
      setInner(measured)
    }
  })
  // Push the latest measured width into optsRef so the next dispatch's
  // reducer call (visual-row navigation, C4) operates on the current
  // layout. Use the same width regime as the render-side layout above
  // — MAX_SAFE_INTEGER for wrap='none' (so the reducer's nextVisualRow
  // sees one row per logical line and Up/Down behave as
  // logical-line nav, matching what the user sees on screen).
  optsRef.current = {
    ...optsRef.current,
    width: effectiveWrap === 'none' ? Number.MAX_SAFE_INTEGER : inner.width,
  }

  // ── Wrap layout + visual cursor coords ─────────────────────────────
  //
  // Build the layout from the current buffer + measured inner width.
  // The layout decomposes the value into VISUAL ROWS (one logical line
  // may produce many rows when its cell width exceeds the budget) and
  // provides bidirectional position maps: logicalToVisual for placing
  // the cursor; visualToLogical for mapping clicks back to char indices.
  //
  // Two width regimes:
  //
  //   - `wrap === 'none'` — pass MAX_SAFE_INTEGER so no row ever wraps.
  //     The layout becomes one row per logical line. Caret math still
  //     works (cell column = sum of cells up to caret); h-scroll
  //     handles horizontal viewport.
  //   - `wrap === 'soft'` — pass measured inner.width. Long lines wrap
  //     onto continuation rows.
  //
  // Width fallback strategy (soft-wrap only). Two distinct cases produce
  // `inner.width === 0`, and they need different handling:
  //
  //   1. First render before yoga has measured. No prior valid width —
  //      use a sensible terminal default (80 cells) so the layout
  //      produces SOMETHING for the box to size against. Next render
  //      with the real width replaces this.
  //   2. Subsequent render after yoga measured 0 — happens when the
  //      terminal shrinks below border + padding (negative inner clamps
  //      to 0 via `Math.max` in measureInnerSize). Falling back to a
  //      constant default (or MAX_SAFE_INTEGER) here causes an INFINITE
  //      LAYOUT LOOP: layout swings between "many narrow rows" (real
  //      width) and "few huge-content rows" (default width); each Text's
  //      yoga measurement differs wildly between modes, the Box's
  //      computed width oscillates, inner.width keeps flipping back and
  //      forth, and the measure useLayoutEffect's setInner never
  //      converges. STICKY-VALID-WIDTH ref breaks the cycle: once we've
  //      measured a positive width, we keep using it as the layout's
  //      width even if a later measurement reports 0. The box on screen
  //      may render clipped, but the layout stays stable and React
  //      doesn't re-render forever.
  const lastValidInnerWidth = useRef(80)
  if (inner.width > 0) lastValidInnerWidth.current = inner.width
  const layoutWidth =
    effectiveWrap === 'none'
      ? Number.MAX_SAFE_INTEGER
      : inner.width > 0
        ? inner.width
        : lastValidInnerWidth.current
  const layout = useMemo(
    () =>
      buildWrapLayout(state.value, {
        width: layoutWidth,
        indentedWrap,
        wordBoundaries,
        hints: wrapHints,
      }),
    [state.value, layoutWidth, indentedWrap, wordBoundaries, wrapHints],
  )
  // Caret in visual cell coords. `col` already includes any indent
  // decoration on continuation rows (display-col convention from
  // wrap-math.ts), so the cursor declaration just adds the box's
  // border+padding offset and subtracts scroll — no manual indent
  // arithmetic needed here.
  const visual = useMemo(() => layout.logicalToVisual(state.caret), [layout, state.caret])

  // "Caret past full last row" projection.
  //
  // When the user types into a soft-wrap row that fills exactly to
  // inner.width and the caret lands at end-of-buffer, wrap-math reports
  // visual.col === inner.width — past the rightmost rendered cell. The
  // historical clamp (visible immediately below in cursorVisualCol)
  // pins the cursor onto the last char of the row, which reads as a
  // one-cell "lag" while the user is typing. The buffer is correct;
  // only the cursor's screen position lags.
  //
  // Project the cursor onto the START of a virtual next row so it shows
  // where the next typed char will actually land. autoHeight (below)
  // grows by one extra row to host it; scrollY (above) accepts a
  // caretPos one past the last layout row via the existing Math.max
  // bump.
  //
  // Gated on `caret === value.length` so this only fires at end-of-
  // buffer — mid-buffer trailing-whitespace cases (caret between
  // content and trailing spaces) keep the original clamp semantic.
  const isCaretPastFullRow =
    effectiveWrap === 'soft' &&
    inner.width > 0 &&
    state.caret === state.value.length &&
    visual.col >= inner.width

  // ── Scroll: keep caret visible inside the visible window ───────────
  //
  // scrollY: visual rows. Always active when innerHeight is bounded.
  // scrollX: cell columns. Only active when wrap='none' — soft-wrap
  // doesn't h-scroll because rows wrap onto the next row instead. The
  // cursor declaration subtracts both unconditionally; in soft-wrap
  // mode scrollX stays at 0, so the math degenerates to the right
  // value.
  const [scrollX, setScrollX] = useState(0)
  const [scrollY, setScrollY] = useState(0)

  // Re-scroll on every change that could shift the caret out of the
  // visible window. See dep notes per-axis below.
  //
  // useEffect (not useLayoutEffect): the next paint reflects both the
  // new caret AND the new scroll in the same render — React batches
  // the setScrollX/Y here with the original cause.
  //
  // First-frame note: `inner.height === 0` / `inner.width === 0` means
  // yoga hasn't measured yet. Skip for one frame; the next render with
  // a measured size triggers via the deps.
  useEffect(() => {
    // Vertical: re-fires on inner.height (box vertical area changed),
    // visual.row (caret's visual row changed — transitively driven by
    // state.value / state.caret / inner.width through useMemos),
    // layout.rows.length (catches the edge where width changes but
    // visual.row stays the same), and scrollY (read-modify-write).
    if (inner.height > 0) {
      // caretPos accounts for the "past full row" projection so the
      // virtual row stays in view when the user just wrapped. Bumping
      // contentSize alongside lets scrollToKeepCaretVisible compute
      // a target one row past the last layout row.
      const caretRow = isCaretPastFullRow ? visual.row + 1 : visual.row
      const next = scrollToKeepCaretVisible({
        scroll: scrollY,
        caretPos: caretRow,
        windowSize: inner.height,
        contentSize: Math.max(layout.rows.length, caretRow + 1),
      })
      if (next !== scrollY) setScrollY(next)
    }
    // Horizontal: only when wrap='none'. caretPos = visual.col (in
    // cells; layout.logicalToVisual returns display cells). contentSize
    // is the current row's cell width — wrap='none' means one row per
    // logical line, so this is the caret's logical line's width. Other
    // logical lines may be longer and clip past the right edge in
    // multiline mode (single shared scrollX); that's the wrap='none'
    // multiline UX, matches vim's nowrap behavior.
    if (effectiveWrap === 'none' && inner.width > 0) {
      const currentRow = layout.rows[visual.row]
      const rowWidth = currentRow ? stringWidth(currentRow.text) : 0
      const next = scrollToKeepCaretVisible({
        scroll: scrollX,
        caretPos: visual.col,
        windowSize: inner.width,
        contentSize: Math.max(rowWidth, visual.col + 1),
      })
      if (next !== scrollX) setScrollX(next)
    } else if (scrollX !== 0) {
      // wrap mode left 'none' (toggled at runtime, OR width=0 first
      // render). Soft-wrap doesn't h-scroll, but the cursor declaration
      // and click handler still subtract / add scrollX unconditionally
      // (degenerate to no-op when 0). A stale non-zero scrollX from the
      // previous wrap='none' epoch would shift cursor and click target
      // off the rendered text. Reset to keep them aligned.
      setScrollX(0)
    }
  }, [
    inner.height,
    inner.width,
    visual.row,
    visual.col,
    layout.rows,
    layout.rows.length,
    scrollX,
    scrollY,
    effectiveWrap,
    isCaretPastFullRow,
  ])

  // Subscribe to focus state via FocusContext. The earlier shortcut
  // `ref.current.focusManager?.activeElement === ref.current` was
  // always false because `focusManager` lives only on the root node
  // (per `dom.ts` — "any node can reach it by walking parentNode").
  // That left `isFocused` permanently false, so the terminal cursor
  // never declared as active and the user saw no caret. Subscribe via
  // the manager so we re-render when this element gains/loses focus.
  const focusCtx = useContext(FocusContext)
  const [isFocused, setIsFocused] = useState(false)
  useEffect(() => {
    const node = ref.current
    if (!node || !focusCtx) return
    setIsFocused(focusCtx.manager.activeElement === node)
    return focusCtx.manager.subscribeToFocus(node, setIsFocused)
  }, [focusCtx])

  // Clipboard access for Ctrl+C / Ctrl+X. Falls back to a no-op when
  // rendered outside `<App>` (unit-test paths) per useClipboard's
  // contract — copy still "succeeds" silently in that case.
  const { copy } = useClipboard()

  // Declare the terminal cursor at the caret, in the box's outer coord
  // system. The hook only renders the cursor when `active` is true —
  // we're active iff this is the focused element.
  //
  // `visual` is in inner-content cell coords (origin = first content
  // cell, after border + padding). Add `inner.offsetX/Y` to translate
  // into outer-box coords (useDeclaredCursor's contract). Subtract
  // scroll so the cursor follows the visible window.
  //
  // scrollY is in visual rows; scrollX is in cells (only non-zero in
  // the future `wrap='none'` mode — soft-wrap leaves it at 0). Both
  // subtractions are unconditional: the inactive axis stays at 0, so
  // the math degenerates to the right value.
  //
  // Cursor declaration coords are interpreted relative to the OUTER
  // box rect, but the rendered text starts at (offsetX, offsetY)
  // inside — past the border and padding. Without the offset, a
  // TextInput with `borderStyle` or `paddingX/Y` lands the visible
  // cursor at the box's outer top-left corner instead of at the
  // caret's actual cell. Visible immediately as a cursor "above" or
  // "to the left of" the text.
  //
  // Two adjustments to the visual coords land here:
  //
  // 1. **Caret-past-full-row projection**: when isCaretPastFullRow
  //    (computed above), place the cursor on (visual.row + 1, 0) so
  //    it shows where the next typed char will land. autoHeight grows
  //    one row to host it; scroll math accepts the +1 caretPos.
  //
  // 2. **Clamp visual.col** to the rightmost in-box cell when the
  //    buffer position is mid-trailing-whitespace (caret < value.length
  //    but visual.col >= inner.width). The trailing whitespace is
  //    invisible and clipped by the renderer; without the clamp the
  //    cursor would land past the box's right border. Logical position
  //    stays in state.caret. Wrap='none' uses scrollX to keep the
  //    caret in view, so this clamp only fires for soft-wrap.
  const cursorVisualRow = isCaretPastFullRow ? visual.row + 1 : visual.row
  const cursorVisualCol = isCaretPastFullRow
    ? 0
    : effectiveWrap === 'soft' && inner.width > 0 && visual.col >= inner.width
      ? Math.max(0, inner.width - 1)
      : visual.col
  const cursorRef = useDeclaredCursor({
    line: inner.offsetY + cursorVisualRow - scrollY,
    column: inner.offsetX + cursorVisualCol - scrollX,
    active: isFocused,
    style: cursorStyle,
    blink: cursorBlink,
    color: cursorColor,
  })

  // Merge cursorRef into our element ref. The hook's ref is for the
  // cursor anchor; ours is for the focus-state read. They go to the
  // same node.
  const setRef = useCallback(
    (node: DOMElement | null) => {
      ref.current = node
      cursorRef(node)
    },
    [cursorRef],
  )

  // ── Event handlers ────────────────────────────────────────────────

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return

      // Clipboard ops (Ctrl+C / Ctrl+X) handled before keyToAction so
      // we can branch on selection state + password mode without
      // bloating the action union with copy/cut variants. The pure
      // `clipboardKeyAction` helper owns the matrix; we just dispatch
      // its decision. Critical "fall through" branches (no-selection
      // Ctrl+C, no-selection Ctrl+X, password-mode Ctrl+C) explicitly
      // do NOT preventDefault — App-level Ctrl+C exit and any future
      // global "cut focused" binding deserve to see the keystroke.
      const clipboardAction = clipboardKeyAction(e, state, password)
      if (clipboardAction) {
        switch (clipboardAction.kind) {
          case 'copy':
            e.preventDefault()
            copy(clipboardAction.text)
            return
          case 'cut':
            e.preventDefault()
            copy(clipboardAction.text)
            dispatch({ type: 'deleteBackward' })
            return
          case 'cut-no-copy':
            e.preventDefault()
            dispatch({ type: 'deleteBackward' })
            return
          case 'fallthrough':
            // No preventDefault — the event continues to App's handler
            // (Ctrl+C exit) or any future global binding.
            return
        }
      }

      const action = keyToAction(e, multiline)
      if (action === 'submit') {
        e.preventDefault()
        onSubmit?.(state.value)
        return
      }
      if (action === 'cancel') {
        e.preventDefault()
        onCancel?.()
        return
      }
      if (action) {
        e.preventDefault()
        dispatch(action)
        return
      }
      // Plain printable keystroke: insert. KeyboardEvent.key is the
      // literal char for printables; multi-character special keys
      // (e.g. 'left', 'backspace') would have been handled above by
      // keyToAction. Skip ctrl/meta combos — consumer may bind them
      // at a higher level.
      if (e.ctrl || e.meta) return
      const ch = e.key
      if (!ch) return
      // Single-grapheme guard. Counted in CODE POINTS, not UTF-16
      // units, so non-BMP printables (most emoji — '😀'.length is 2
      // because of the surrogate pair, but [...'😀'].length is 1)
      // pass through. Multi-grapheme `key` strings (the named special
      // keys above) are filtered out here.
      if ([...ch].length !== 1) return
      // Drop non-printable (control) chars silently. Anything < 0x20
      // except \t we treat as non-text. Surrogate-pair emoji land far
      // above 0x20 in their full code point, so this gate doesn't
      // affect them. (Newlines come through as `key === 'return'`
      // and are handled in keyToAction's submit branch above.)
      const code = ch.codePointAt(0) ?? 0
      if (code < 0x20 && ch !== '\t') return
      e.preventDefault()
      dispatch({ type: 'insertText', text: ch })
    },
    // state in deps (not state.value alone) so the closure sees the
    // current selection inside clipboardKeyAction. password + copy
    // gate the new clipboard branch above.
    [disabled, multiline, password, onSubmit, onCancel, state, copy],
  )

  const handlePaste = useCallback(
    (e: PasteEvent) => {
      if (disabled) return
      e.preventDefault()
      dispatch({ type: 'insertText', text: e.text, isPaste: true })
    },
    [disabled],
  )

  // Click positions the caret. Mouse drag (gesture-captured) extends
  // selection. Translates click cell coords through the wrap layout's
  // `visualToLogical` to land on the buffer char idx the user clicked.
  const handleMouseDown = useCallback(
    (e: MouseDownEvent) => {
      if (disabled) return
      // Manually focus on press. The default click-to-focus path lives
      // in `dispatchClick` (hit-test.ts) — but capturing a gesture in
      // onMouseDown short-circuits the release-side dispatchClick (see
      // App.handleMouseEvent's release branch: when `activeGesture` is
      // set it fires onUp and returns early, never calling onClickAt).
      // Without this manual call, clicking a TextInput would never
      // focus it, and Tab would be the only way to land in.
      const node = ref.current
      if (focusCtx && node) focusCtx.manager.focus(node)

      // Click coords are local to the Box (0-indexed from its top-left
      // INCLUDING padding/border). The rendered content starts at
      // (offsetX, offsetY) inside the box; subtract those to get into
      // the inner content's coord system. Add scroll offsets to map
      // visible cell → buffer cell. visualToLogical clamps row + col
      // to the layout bounds, so out-of-content clicks (border/padding
      // area) snap to the nearest valid char position.
      //
      // Password+non-ASCII edge case: layout was built on the unmasked
      // buffer; click cell math operates on those widths. For ASCII
      // passwords (the common case), unmasked widths === masked widths.
      // Non-ASCII passwords (emoji/CJK in a masked buffer) inherit the
      // off-by-N click position the pre-soft-wrap code also had.
      const idx = layout.visualToLogical(
        e.localRow - inner.offsetY + scrollY,
        e.localCol - inner.offsetX + scrollX,
      )
      dispatch({ type: 'setCaret', charIdx: idx, extend: e.shiftKey })
      e.captureGesture({
        onMove(m) {
          const newIdx = layout.visualToLogical(
            m.row - (e.row - e.localRow) - inner.offsetY + scrollY,
            m.col - (e.col - e.localCol) - inner.offsetX + scrollX,
          )
          dispatch({ type: 'setCaret', charIdx: newIdx, extend: true })
        },
      })
    },
    [disabled, layout, inner.offsetX, inner.offsetY, scrollX, scrollY, focusCtx],
  )

  // ── Rendering ─────────────────────────────────────────────────────

  // Render visual rows from the wrap layout, slicing the selection
  // per-row, applying password masking + indent decoration. scrollY
  // windows the visible row range when innerHeight constrains the
  // box; on first render (innerHeight === 0) all rows render so the
  // box can size to content.
  const renderedLines = useMemo(
    () =>
      renderLines(state, layout, {
        password,
        passwordChar,
        selectionColor,
        placeholder,
        scrollX,
        scrollY,
        innerHeight: inner.height,
        innerWidth: inner.width,
        wrap: effectiveWrap,
      }),
    [
      state,
      layout,
      password,
      passwordChar,
      selectionColor,
      placeholder,
      scrollX,
      scrollY,
      inner.height,
      inner.width,
      effectiveWrap,
    ],
  )

  // Focus-aware border color. Extract idle borderColor from boxProps so
  // we can compute the swapped value cleanly (avoids passing both via
  // spread + override). When focused, paint with `borderColorFocus`;
  // otherwise fall through to whatever the consumer provided as the
  // idle `borderColor` (or terminal default if undefined). The swap is
  // a no-op when no `borderStyle` is set — there's no border to color.
  //
  // Validation precedence: error wins over focus wins over idle. The
  // non-empty-message coercion below makes empty-string returns from
  // `validate` indistinguishable from null (valid) — see prop docstring.
  const { borderColor: idleBorderColor, ...restBoxProps } = boxProps
  const validationMessage = validate ? validate(state.value) || null : null
  const renderedBorderColor = validationMessage
    ? errorColor
    : isFocused
      ? borderColorFocus
      : idleBorderColor

  // Auto-grow height (multiline only, opt-in, no explicit height). The
  // wrap layout already knows row count for the current (value, width);
  // we add the box's vertical chrome (border + padding) to convert from
  // inner content rows to outer box height. Yoga's existing minHeight /
  // maxHeight style props (passed through restBoxProps) clamp the
  // result — beyond maxHeight, scrollY kicks in via the existing scroll
  // path, so very long content still keeps the caret visible.
  //
  // String / percentage padding falls through as 0 cells; auto-grow
  // assumes cell-based chrome and the docstring documents this gap.
  const autoGrowActive = autoGrow && multiline && restBoxProps.height === undefined
  const verticalChrome = autoGrowActive ? computeVerticalChrome(restBoxProps) : 0
  // Include the +1 virtual row when the cursor is projected past a
  // full last row so the box has a cell to host the cursor; otherwise
  // the cursor would land on the bottom border / padding.
  const autoRowCount = layout.rows.length + (isCaretPastFullRow ? 1 : 0)
  const autoHeight = autoGrowActive ? Math.max(1, autoRowCount) + verticalChrome : undefined

  return (
    <Box
      {...restBoxProps}
      ref={setRef}
      tabIndex={restBoxProps.tabIndex ?? 0}
      autoFocus={autoFocus}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      onMouseDown={handleMouseDown}
      flexDirection="column"
      borderColor={renderedBorderColor}
      height={autoHeight ?? restBoxProps.height}
    >
      {renderedLines}
      {validationMessage &&
        (renderError ? (
          renderError(validationMessage)
        ) : (
          <Text color={errorColor} dim>
            {validationMessage}
          </Text>
        ))}
    </Box>
  )
}

/**
 * Vertical chrome (border + padding) the auto-grow path adds to the
 * inner row count to derive an outer box height. Numeric padding only —
 * string / percentage falls through as 0 cells. Border counts 1 cell per
 * side when `borderStyle` is set.
 */
function computeVerticalChrome(boxProps: BoxProps): number {
  const border = boxProps.borderStyle ? 2 : 0
  const padBase = typeof boxProps.padding === 'number' ? boxProps.padding : 0
  const padY = typeof boxProps.paddingY === 'number' ? boxProps.paddingY : padBase
  const padTop = typeof boxProps.paddingTop === 'number' ? boxProps.paddingTop : padY
  const padBottom = typeof boxProps.paddingBottom === 'number' ? boxProps.paddingBottom : padY
  return border + padTop + padBottom
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Map a KeyboardEvent into a reducer action, or 'submit' / 'cancel'
 *  for non-action signals, or null for unhandled. Pure function so the
 *  binding table is auditable in one place. */
function keyToAction(e: KeyboardEvent, multiline: boolean): Action | 'submit' | 'cancel' | null {
  const k = e.key
  // Submit / cancel
  if (k === 'return') {
    if (multiline && !e.ctrl) {
      return { type: 'insertText', text: '\n' }
    }
    return 'submit'
  }
  if (k === 'escape') return 'cancel'

  // Movement
  if (k === 'left') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'wordLeft' : 'left',
      extend: e.shift,
    }
  }
  if (k === 'right') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'wordRight' : 'right',
      extend: e.shift,
    }
  }
  if (k === 'up') return { type: 'moveCaret', direction: 'up', extend: e.shift }
  if (k === 'down') return { type: 'moveCaret', direction: 'down', extend: e.shift }
  if (k === 'home') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'docStart' : 'home',
      extend: e.shift,
    }
  }
  if (k === 'end') {
    return {
      type: 'moveCaret',
      direction: e.ctrl ? 'docEnd' : 'end',
      extend: e.shift,
    }
  }

  // Deletion
  if (k === 'backspace') {
    if (e.ctrl) return { type: 'deleteWordBackward' }
    return { type: 'deleteBackward' }
  }
  if (k === 'delete') return { type: 'deleteForward' }

  // Ctrl shortcuts. KeyboardEvent.key for ctrl+letter is the lowercase
  // letter (parsed from the parsedKey.name in the Kitty/standard
  // protocol); shift modifies it to uppercase or stays lowercase
  // depending on terminal encoding — accept both.
  if (e.ctrl && !e.shift) {
    if (k === 'w') return { type: 'deleteWordBackward' }
    if (k === 'u') return { type: 'deleteLineBackward' }
    if (k === 'k') return { type: 'deleteLineForward' }
    if (k === 'a') return { type: 'selectAll' }
    if (k === 'z') return { type: 'undo' }
    if (k === 'y') return { type: 'redo' }
  }
  if (e.ctrl && e.shift && (k === 'z' || k === 'Z')) return { type: 'redo' }

  return null
}

type RenderOpts = {
  password: boolean
  passwordChar: string
  selectionColor: Color
  placeholder: string | undefined
  /** Horizontal scroll offset (cells). Only non-zero when wrap='none'. */
  scrollX: number
  scrollY: number
  innerHeight: number
  /** Inner content width (cells, net of border + padding). Needed by
   *  the multi-row selection renderer (wrap='soft') to compute
   *  right-edge slack, AND by the per-row cell-slicing path
   *  (wrap='none') to know how many cells to slice per row. */
  innerWidth: number
  /** Active wrap mode. `'soft'` uses the wrap layout's visual rows
   *  with multi-row selection-stripe rendering. `'none'` renders one
   *  row per logical line and cell-slices each row by `scrollX` for
   *  horizontal scroll. */
  wrap: 'soft' | 'none'
}

/** Mask one row's text with `passwordChar` repeated per code-point.
 *  Operates on a single visual row (no `\n` inside row.text, so the
 *  line-splitting maskValue used to do is unnecessary here). */
function maskRowText(rowText: string, password: boolean, passwordChar: string): string {
  if (!password) return rowText
  return passwordChar.repeat([...rowText].length)
}

/** Render visual rows from the wrap layout, slicing each row's
 *  selection range and applying password masking + indent decoration.
 *
 *  Multi-row selection rendering: a selection that spans more than one
 *  visual row paints as a CONTINUOUS STRIPE — partial-row segments at
 *  the start/end fill the row's right-edge slack with selection bg,
 *  and continuation rows get the same bg over their hanging-indent
 *  decoration. Eye sees one highlighted region instead of a series of
 *  disconnected per-row segments.
 *
 *  Two row-edge booleans drive the decoration:
 *
 *    - `indentBg`: selection started BEFORE this row's first char →
 *      indent decoration cells get bg. Means the row is mid- or
 *      end-of a multi-row selection (selection coming in from above).
 *    - `rightSlackBg`: selection extends PAST this row's last char →
 *      slack from row content's right edge to box's right edge gets
 *      bg. Means selection continues onto the next row.
 *
 *  Empty buffer renders the placeholder dimmed (single-row,
 *  truncate-end so a long placeholder doesn't itself wrap). Empty
 *  visual rows in a multi-row selection are NOT yet bg-decorated;
 *  D3 adds that.
 *
 *  Per-row selection slicing uses UNMASKED row.text indices because
 *  row.startCharIdx / state.caret / state.selection are all buffer-
 *  relative (unmasked). For ASCII passwords this is identity to the
 *  masked-text indices; for non-ASCII passwords (emoji/CJK in a masked
 *  buffer) the slice may overshoot, so it's clamped to maskedText
 *  length defensively. */
function renderLines(state: TextInputState, layout: WrapLayout, opts: RenderOpts): React.ReactNode {
  const {
    password,
    passwordChar,
    selectionColor,
    placeholder,
    scrollX,
    scrollY,
    innerHeight,
    innerWidth,
    wrap,
  } = opts

  if (state.value === '' && placeholder) {
    return (
      <Text dim wrap="truncate-end">
        {placeholder}
      </Text>
    )
  }

  const [selStart, selEnd] = selectionOrCaretRange(state)

  // Window the visual rows vertically. innerHeight === 0 means yoga
  // hasn't measured yet (first render) — emit all rows so the box can
  // size to content; subsequent renders apply the slice.
  const visibleRows =
    innerHeight > 0 ? layout.rows.slice(scrollY, scrollY + innerHeight) : layout.rows

  // wrap='none' branch: one row per logical line, cell-sliced by
  // scrollX for horizontal scroll. Selection is rendered in-row only —
  // multi-row selection stripe (right-edge / indent fill) doesn't
  // apply because hanging-indent doesn't apply, and the row's right
  // edge is past the visible window when content overflows. Same
  // approximation the pre-soft-wrap renderer used for selection across
  // a horizontally-scrolled wide char (selection cell math treats
  // scroll offset as char-aligned).
  if (wrap === 'none') {
    return visibleRows.map((row, rowIdx) => {
      const maskedText = maskRowText(row.text, password, passwordChar)
      const visibleText =
        innerWidth > 0 ? sliceRowByCells(maskedText, scrollX, innerWidth) : maskedText
      const localStart = clamp(selStart - row.startCharIdx, 0, row.text.length)
      const localEnd = clamp(selEnd - row.startCharIdx, 0, row.text.length)
      // visStart / visEnd: selection range in the SLICED visible text.
      // Subtract scrollX (cells) from char-relative localStart/End AND
      // clamp to [0, visibleText.length]. Without the upper clamp, a
      // selection that's entirely to the right of the horizontal
      // viewport (selStart and selEnd both past scrollX + innerWidth)
      // would still pass `visStart !== visEnd` and the renderer would
      // fall into the selection branch, rendering a phantom
      // highlighted space (the empty slice + `|| ' '` fallback).
      // After clamping, off-screen selections collapse to
      // `visStart === visEnd` and the plain-render branch fires.
      // Cell math is char-aligned for ASCII content; off-by-N for
      // wide chars at the boundary, same v1 limitation as the
      // pre-soft-wrap renderer.
      const visStart =
        innerWidth > 0 ? clamp(localStart - scrollX, 0, visibleText.length) : localStart
      const visEnd = innerWidth > 0 ? clamp(localEnd - scrollX, 0, visibleText.length) : localEnd

      if (visStart === visEnd) {
        return (
          <Text
            // biome-ignore lint/suspicious/noArrayIndexKey: see comment below
            key={rowIdx}
            wrap="truncate-end"
          >
            {visibleText || ' '}
          </Text>
        )
      }

      // Clamping ensures visStart < visEnd here, so the slice is
      // guaranteed non-empty — no `|| ' '` fallback needed.
      const before = visibleText.slice(0, visStart)
      const sel = visibleText.slice(visStart, visEnd)
      const after = visibleText.slice(visEnd)
      return (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: see comment below
          key={rowIdx}
          wrap="truncate-end"
        >
          {before}
          <Text backgroundColor={selectionColor}>{sel}</Text>
          {after}
        </Text>
      )
    })
  }

  // Walk visible rows, emitting per-row segments. Index-as-key is
  // correct here: rows have no stable identity (the buffer re-renders
  // on every keystroke), and a stable key per slot avoids unmount-on-
  // edit.
  return visibleRows.map((row, rowIdx) => {
    // Empty visual row (from an empty logical line / consecutive \n).
    // Renders as a single space — gives the row visual height so the
    // caret can sit on it, AND fills it with selection bg if a
    // multi-row selection range passes through this position. Without
    // the bg, a selection that spans empty lines would appear visually
    // broken (gaps between the highlighted content rows).
    //
    // Touched-by-selection condition for an empty row at position P:
    // P falls inside the half-open range [selStart, selEnd). The
    // `selStart < selEnd` guard excludes a degenerate caret-only
    // "selection" (anchor === focus) from being treated as a stripe.
    if (row.text === '') {
      const P = row.startCharIdx
      const touchesSelection = selStart < selEnd && selStart <= P && P < selEnd
      // Pad empty rows to the full inner width so every cell inside
      // the box is explicitly written. Otherwise cells past the single
      // placeholder space stay at terminal background, which can look
      // visually inconsistent inside the box. Falls back to a single
      // space when innerWidth isn't measured yet (first render).
      const fillCells = innerWidth > 0 ? Math.max(1, innerWidth) : 1
      return (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
          key={rowIdx}
          wrap="truncate-end"
          backgroundColor={touchesSelection ? selectionColor : undefined}
        >
          {' '.repeat(fillCells)}
        </Text>
      )
    }

    const maskedText = maskRowText(row.text, password, passwordChar)
    // Hanging-indent decoration: spaces prepended to continuation rows
    // so they visually align under the first non-whitespace char of
    // the original logical line. Always 0 (and thus the empty string)
    // for non-continuation rows — their leading whitespace is in
    // row.text already.
    const indent = row.indentCells > 0 ? ' '.repeat(row.indentCells) : ''

    // Clip the masked text to fit available content cells (innerWidth
    // minus indent decoration). Wrap-math allows trailing whitespace
    // to overflow the row's nominal width (HTML/CSS pre-wrap convention
    // — spaces are visual nothing and shouldn't reflow surrounding
    // content as the user types more chars). Clipping here prevents
    // the rendering Text's truncate-end from triggering on what's
    // actually invisible whitespace; without it, every row that ends
    // with a trailing space at the wrap boundary shows an ellipsis on
    // an otherwise clean wrap.
    const maxContentCells =
      innerWidth > 0 ? Math.max(0, innerWidth - row.indentCells) : Number.MAX_SAFE_INTEGER
    const visibleMaskedText =
      innerWidth > 0 && stringWidth(maskedText) > maxContentCells
        ? sliceRowByCells(maskedText, 0, maxContentCells)
        : maskedText
    // Trailing pad: always render full-width rows so every cell inside
    // the box is explicitly written (as a space char). Without this,
    // cells past row content stay at terminal background — visually
    // can look like inconsistent "random spaces" against the box's
    // interior, especially when the box is much wider than the row's
    // content. Padding makes the rendered area visually uniform.
    const trailingPad =
      innerWidth > 0 ? Math.max(0, maxContentCells - stringWidth(visibleMaskedText)) : 0
    const trailingPadStr = trailingPad > 0 ? ' '.repeat(trailingPad) : ''

    // Selection slice in unmasked-row-text indices.
    const localStart = clamp(selStart - row.startCharIdx, 0, row.text.length)
    const localEnd = clamp(selEnd - row.startCharIdx, 0, row.text.length)
    const hasInRowSelection = localStart < localEnd

    if (!hasInRowSelection) {
      // No selection on this row — render plain. Padded to full width.
      return (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
          key={rowIdx}
          wrap="truncate-end"
        >
          {indent + visibleMaskedText + trailingPadStr}
        </Text>
      )
    }

    // Selection decoration. Each row paints as: [indent (maybe bg)]
    // [before][sel + slack (bg)][after][pad]. The indent gets bg only
    // when selection extended from the row above (selStart strictly
    // less than this row's start); the right-slack gets bg when
    // selection reaches OR extends past this row's end position. The
    // `>=` (vs `>`) handles the case where the user dragged through
    // empty cells past content end — selection clamps to
    // row.endCharIdx (per layout.visualToLogical), but visually the
    // highlight should still fill the slack so it's clear what the
    // user dragged over. Matches VS Code / Sublime behavior.
    //
    // The trailing pad goes EITHER inside the bg slack (when selection
    // extends to row end → trailingPadStr fills with bg as part of
    // slack) OR after the after segment (when selection is contained
    // within content → trailingPadStr fills with no bg as final pad).
    // Either way the rendered row is full-width.
    const indentBg = selStart < row.startCharIdx
    const rightSlackBg = selEnd >= row.endCharIdx
    const slackChars = rightSlackBg ? trailingPadStr : ''
    const trailingNoBg = rightSlackBg ? '' : trailingPadStr

    // Defensive clamp for the password+non-ASCII edge AND for the
    // trailing-whitespace clip above: visibleMaskedText length can be
    // < unmasked-row length, so localStart/localEnd may overshoot.
    const sliceStart = Math.min(localStart, visibleMaskedText.length)
    const sliceEnd = Math.min(localEnd, visibleMaskedText.length)
    const before = visibleMaskedText.slice(0, sliceStart)
    const sel = visibleMaskedText.slice(sliceStart, sliceEnd) || ' '
    const after = visibleMaskedText.slice(sliceEnd)
    return (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
        key={rowIdx}
        wrap="truncate-end"
      >
        {indentBg ? <Text backgroundColor={selectionColor}>{indent}</Text> : indent}
        {before}
        <Text backgroundColor={selectionColor}>
          {sel}
          {slackChars}
        </Text>
        {after}
        {trailingNoBg}
      </Text>
    )
  })
}

/**
 * Read the inner content area (width × height) from a Box's yoga
 * node, subtracting border + padding insets. Returns 0/0 when the
 * yoga layout isn't available yet (first render before
 * calculateLayout, or detached node).
 */
function measureInnerSize(node: DOMElement): {
  width: number
  height: number
  /** Cell columns from outer-box left edge to where content starts
   *  (border + padding). Used to align the cursor declaration with
   *  the rendered text — without this offset, the declared cursor
   *  lands at the box's outer top-left corner rather than at the
   *  caret's actual cell. */
  offsetX: number
  /** Cell rows from outer-box top edge to where content starts. */
  offsetY: number
} {
  const yoga = node.yogaNode
  if (!yoga) return { width: 0, height: 0, offsetX: 0, offsetY: 0 }
  const w = yoga.getComputedWidth()
  const h = yoga.getComputedHeight()
  if (!w || !h) return { width: 0, height: 0, offsetX: 0, offsetY: 0 }
  const padL = yoga.getComputedPadding(LayoutEdge.Left) ?? 0
  const padR = yoga.getComputedPadding(LayoutEdge.Right) ?? 0
  const padT = yoga.getComputedPadding(LayoutEdge.Top) ?? 0
  const padB = yoga.getComputedPadding(LayoutEdge.Bottom) ?? 0
  const brL = yoga.getComputedBorder(LayoutEdge.Left) ?? 0
  const brR = yoga.getComputedBorder(LayoutEdge.Right) ?? 0
  const brT = yoga.getComputedBorder(LayoutEdge.Top) ?? 0
  const brB = yoga.getComputedBorder(LayoutEdge.Bottom) ?? 0
  return {
    width: Math.max(0, Math.floor(w - padL - padR - brL - brR)),
    height: Math.max(0, Math.floor(h - padT - padB - brT - brB)),
    offsetX: Math.floor(brL + padL),
    offsetY: Math.floor(brT + padT),
  }
}

function clamp(v: number, lo: number, hi: number): number {
  if (v < lo) return lo
  if (v > hi) return hi
  return v
}
