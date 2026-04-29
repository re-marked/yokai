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
import type { Color } from '../../styles.js'
import type { CursorStyle } from '../../termio/dec.js'
import Box, { type Props as BoxProps } from '../Box.js'
import FocusContext from '../FocusContext.js'
import Text from '../Text.js'
import { clipboardKeyAction } from './clipboard-action.js'
import { scrollToKeepCaretVisible } from './scroll-math.js'
import {
  type Action,
  type ReducerOptions,
  type TextInputState,
  initialState,
  reduce,
  selectionOrCaretRange,
} from './state.js'
import { type WrapLayout, buildWrapLayout } from './wrap-math.js'

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
  ...boxProps
}: PropsWithChildren<TextInputProps>): React.ReactNode {
  const isControlled = value !== undefined

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
  optsRef.current = {
    multiline,
    maxLength,
    historyCap,
    width: optsRef.current.width,
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
  // reducer call (visual-row navigation, post-C4) operates on the
  // current layout. Lags by one frame on the very first render (yoga
  // hasn't measured yet); the wrap-math primitive treats width=0 as
  // "no layout, no rows" and visual-row nav falls back gracefully.
  optsRef.current = { ...optsRef.current, width: inner.width }

  // ── Wrap layout + visual cursor coords ─────────────────────────────
  //
  // Build the soft-wrap layout from the current buffer and the
  // measured inner width. The layout decomposes the value into VISUAL
  // ROWS (one logical line may produce many rows when its cell width
  // exceeds the budget) and provides bidirectional position maps:
  // logicalToVisual for placing the cursor; visualToLogical for
  // mapping clicks back to char indices.
  //
  // Width fallback strategy. Two distinct cases produce
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
  const layoutWidth = inner.width > 0 ? inner.width : lastValidInnerWidth.current
  const layout = useMemo(
    () => buildWrapLayout(state.value, { width: layoutWidth }),
    [state.value, layoutWidth],
  )
  // Caret in visual cell coords. `col` already includes any indent
  // decoration on continuation rows (display-col convention from
  // wrap-math.ts), so the cursor declaration just adds the box's
  // border+padding offset and subtracts scroll — no manual indent
  // arithmetic needed here.
  const visual = useMemo(() => layout.logicalToVisual(state.caret), [layout, state.caret])

  // ── Scroll: keep caret visible inside the visible window ───────────
  //
  // scrollY is in VISUAL rows (was logical lines pre-soft-wrap).
  // scrollX is retained for the future `wrap='none'` opt-in (E1) and
  // stays at 0 in the soft-wrap default — rows wrap onto next-row
  // instead of horizontally scrolling within a row. The setter is
  // prefixed `_` because nothing writes it yet (E1 will rename back).
  const [scrollX, _setScrollX] = useState(0)
  const [scrollY, setScrollY] = useState(0)

  // Adjust scrollY on every change that could shift the caret's
  // visual row out of the visible window. Re-fires on:
  //
  //   - inner.height — the box's vertical content area changed (the
  //     window the caret must fit inside grew or shrank).
  //   - visual.row — the caret's visual position changed. This is
  //     transitively driven by state.value (typing / pasting / undo),
  //     state.caret (any caret-moving action), AND inner.width
  //     (terminal/container resize → wrap layout rebuild → caret
  //     visual position recomputes via logicalToVisual). One
  //     dependency captures all three sources because `visual` is a
  //     useMemo over (layout, state.caret) and `layout` is a useMemo
  //     over (state.value, inner.width).
  //   - layout.rows.length — the total row count changed. Catches the
  //     edge where width changes but visual.row happens to stay the
  //     same (e.g. caret on row 0, width grows so content needs
  //     fewer rows): scrollY needs to clamp to the new max.
  //   - scrollY — needed for the read-modify-write inside the effect.
  //
  // useEffect (not useLayoutEffect): the next paint reflects both the
  // new caret AND the new scroll in the same render — React batches
  // the setScrollY here with the original cause.
  //
  // First-frame note: `inner.height === 0` means yoga hasn't measured
  // yet. Skip the re-scroll for one frame; the next render with a
  // measured height triggers via the inner.height dep.
  useEffect(() => {
    if (inner.height > 0) {
      const next = scrollToKeepCaretVisible({
        scroll: scrollY,
        caretPos: visual.row,
        windowSize: inner.height,
        contentSize: Math.max(layout.rows.length, visual.row + 1),
      })
      if (next !== scrollY) setScrollY(next)
    }
  }, [inner.height, visual.row, layout.rows.length, scrollY])

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
  const cursorRef = useDeclaredCursor({
    line: inner.offsetY + visual.row - scrollY,
    column: inner.offsetX + visual.col - scrollX,
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
        scrollY,
        innerHeight: inner.height,
      }),
    [state, layout, password, passwordChar, selectionColor, placeholder, scrollY, inner.height],
  )

  // Focus-aware border color. Extract idle borderColor from boxProps so
  // we can compute the swapped value cleanly (avoids passing both via
  // spread + override). When focused, paint with `borderColorFocus`;
  // otherwise fall through to whatever the consumer provided as the
  // idle `borderColor` (or terminal default if undefined). The swap is
  // a no-op when no `borderStyle` is set — there's no border to color.
  const { borderColor: idleBorderColor, ...restBoxProps } = boxProps
  const renderedBorderColor = isFocused ? borderColorFocus : idleBorderColor

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
    >
      {renderedLines}
    </Box>
  )
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
  scrollY: number
  innerHeight: number
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
 *  Empty buffer renders the placeholder dimmed (single-row,
 *  truncate-end so a long placeholder doesn't itself wrap).
 *
 *  Per-row selection slicing uses UNMASKED row.text indices because
 *  row.startCharIdx / state.caret / state.selection are all buffer-
 *  relative (unmasked). For ASCII passwords this is identity to the
 *  masked-text indices; for non-ASCII passwords (emoji/CJK in a masked
 *  buffer) the slice may overshoot, so it's clamped to maskedText
 *  length defensively. */
function renderLines(state: TextInputState, layout: WrapLayout, opts: RenderOpts): React.ReactNode {
  const { password, passwordChar, selectionColor, placeholder, scrollY, innerHeight } = opts

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

  // Walk visible rows, emitting per-row segments. Index-as-key is
  // correct here: rows have no stable identity (the buffer re-renders
  // on every keystroke), and a stable key per slot avoids unmount-on-
  // edit.
  return visibleRows.map((row, rowIdx) => {
    const maskedText = maskRowText(row.text, password, passwordChar)
    // Hanging-indent decoration: spaces prepended to continuation rows
    // so they visually align under the first non-whitespace char of
    // the original logical line. Always 0 (and thus the empty string)
    // for non-continuation rows — their leading whitespace is in
    // row.text already.
    const indent = row.indentCells > 0 ? ' '.repeat(row.indentCells) : ''

    // Selection slice in unmasked-row-text indices.
    const localStart = clamp(selStart - row.startCharIdx, 0, row.text.length)
    const localEnd = clamp(selEnd - row.startCharIdx, 0, row.text.length)

    if (localStart === localEnd) {
      // No selection on this row — render plain. The `|| ' '` ensures
      // empty visual rows (zero-cell rows for empty logical lines) get
      // a single space so the row has height 1; the caret can land on
      // it. For non-empty content the indent + masked text is used.
      return (
        <Text
          // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
          key={rowIdx}
          wrap="truncate-end"
        >
          {indent + maskedText || ' '}
        </Text>
      )
    }

    // Defensive clamp for the password+non-ASCII edge: mask length can
    // be < row.text length when the buffer has multi-UTF-16-unit graphemes.
    const sliceStart = Math.min(localStart, maskedText.length)
    const sliceEnd = Math.min(localEnd, maskedText.length)
    const before = maskedText.slice(0, sliceStart)
    const sel = maskedText.slice(sliceStart, sliceEnd) || ' '
    const after = maskedText.slice(sliceEnd)
    return (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: see comment above
        key={rowIdx}
        wrap="truncate-end"
      >
        {indent}
        {before}
        <Text backgroundColor={selectionColor}>{sel}</Text>
        {after}
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
